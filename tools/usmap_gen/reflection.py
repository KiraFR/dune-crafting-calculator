"""Recover Unreal Engine compiled-in reflection data from a stripped Linux server binary.

UHT emits constant `UECodeGen_Private::F{Struct,Enum,Class}Params` tables that the engine turns into
UScriptStruct / UEnum / UClass objects at startup. In a PIE binary every pointer inside those tables is
a dynamic relocation, so the tables can be found and walked without running the binary.

Layouts below were checked against the Dune: Awakening server build (UE 5.2, Funcom fork).
"""
from collections import Counter
from dataclasses import dataclass, field

TEXT, RODATA, RELRO = ".text", ".rodata", ".data.rel.ro"

# EPropertyGenFlags (low 6 bits)
GEN_BYTE, GEN_BOOL, GEN_ARRAY, GEN_MAP, GEN_SET, GEN_STRUCT, GEN_ENUM = 0x00, 0x0C, 0x16, 0x17, 0x18, 0x19, 0x1E
# Property param kinds that carry a type pointer (UEnum/UClass/UScriptStruct/UFunction getter) at +64.
GEN_WITH_TYPE_PTR = {0x00, 0x0D, 0x0E, 0x0F, 0x10, 0x11, 0x12, 0x13, 0x19, 0x1A, 0x1B, 0x1C, 0x1E, 0x1F}

# FPropertyParamsBase offsets
P_NAME, P_GENFLAGS, P_ARRAYDIM, P_TYPEPTR = 0, 24, 32, 64
# FStructParams: OuterFunc, SuperFunc, StructOpsFunc, NameUTF8, SizeOf, AlignOf, PropertyArray, NumProperties
S_SUPER, S_NAME, S_SIZE, S_ALIGN, S_PROPS, S_NUMPROPS = 8, 24, 32, 40, 48, 56
# FEnumParams: OuterFunc, DisplayNameFunc, NameUTF8, CppTypeUTF8, EnumeratorParams, NumEnumerators
E_NAME, E_CPPTYPE, E_ENTRIES, E_NUM = 16, 24, 32, 40
# FClassParams: NoRegisterFunc, ConfigName, CppClassInfo, Dependencies, Functions, Properties, Interfaces, counts
C_CONFIG, C_CPPINFO, C_DEPS, C_FUNCS, C_PROPS, C_IFACES = 8, 16, 24, 32, 40, 48
C_NUMDEPS, C_NUMFUNCS, C_NUMPROPS, C_NUMIFACES = 56, 60, 64, 68


@dataclass
class Prop:
    name: str
    gen: int
    array_dim: int
    type_ptr: int | None = None
    inner: "Prop | None" = None  # array/set element, enum underlying type, map key
    value: "Prop | None" = None  # map value
    type_name: str | None = None  # resolved struct or enum name


@dataclass
class TypeDef:
    kind: str  # "struct" | "class"
    name: str
    super_ptr: int | None
    props: list[Prop] = field(default_factory=list)
    super_name: str | None = None


@dataclass
class EnumDef:
    name: str
    entries: list[tuple[str, int]]


def is_identifier(s):
    return bool(s) and (s[0].isalpha() or s[0] == "_") and all(c.isalnum() or c == "_" for c in s)


class Reflection:
    def __init__(self, elf):
        self.elf = elf
        self.structs: dict[int, TypeDef] = {}
        self.classes: dict[int, TypeDef] = {}
        self.enums: dict[int, EnumDef] = {}
        self._resolved: dict[int, int | None] = {}
        self.stats = Counter()

    # ---- discovery -------------------------------------------------------------------------------

    def discover(self):
        elf = self.elf
        class_entries = []
        for slot, target in elf.ptr.items():
            if not elf.in_section(slot, RELRO) or not elf.in_section(target, RODATA):
                continue
            self._try_struct(slot - S_NAME)
            self._try_enum(slot - E_NAME)
            name = elf.utf16(target)
            if name and len(name) > 1 and name[0] in "UA" and name[1].isupper() and is_identifier(name):
                class_entries.append((slot - 16, name))
        for base, name in class_entries:
            self._try_class_registration(base, name)
        self._load_all_props()
        self._link()

    def _ptr_in(self, va, section, nullable=False):
        target = self.elf.ptr.get(va)
        if target is None:
            return nullable and self.elf.u64(va) == 0
        return self.elf.in_section(target, section)

    def _try_struct(self, base):
        elf = self.elf
        if base in self.structs or not elf.in_section(base, RELRO):
            return
        if not (self._ptr_in(base, TEXT) and self._ptr_in(base + S_SUPER, TEXT, True) and self._ptr_in(base + 16, TEXT, True)):
            return
        if S_SIZE + base in elf.ptr or S_ALIGN + base in elf.ptr:
            return
        size, align, num = elf.u64(base + S_SIZE), elf.u64(base + S_ALIGN), elf.i32(base + S_NUMPROPS)
        if not (0 < size < 1 << 24 and align in (1, 2, 4, 8, 16, 32, 64) and 0 <= num < 4096):
            return
        if not self._ptr_in(base + S_PROPS, RELRO, nullable=(num == 0)):
            return
        name = elf.cstr(elf.ptr[base + S_NAME])
        if not is_identifier(name):
            return
        self.structs[base] = TypeDef("struct", name, elf.ptr.get(base + S_SUPER))

    def _try_enum(self, base):
        elf = self.elf
        if base in self.enums or not elf.in_section(base, RELRO):
            return
        if not (self._ptr_in(base, TEXT) and self._ptr_in(base + 8, TEXT, True) and self._ptr_in(base + E_CPPTYPE, RODATA)):
            return
        num = elf.i32(base + E_NUM)
        # Real UENUMs always have at least one enumerator (UHT adds _MAX); empty matches are FClassParams
        # whose config-name string happens to sit where FEnumParams keeps its name.
        if not (0 < num < 65536) or base + E_NUM in elf.ptr:
            return
        if not self._ptr_in(base + E_ENTRIES, RELRO):
            return
        name = elf.cstr(elf.ptr[base + E_NAME])
        if not is_identifier(name):
            return
        entries = []
        arr = elf.ptr.get(base + E_ENTRIES)
        for k in range(num):
            entry_name = elf.cstr(elf.ptr.get(arr + 16 * k, 0)) if arr else None
            if entry_name is None:
                return
            entries.append((entry_name, elf.i64(arr + 16 * k + 8)))
        self.enums[base] = EnumDef(name, entries)

    def _try_class_registration(self, entry, name):
        """FClassRegisterCompiledInInfo {OuterRegister, InnerRegister, TCHAR* Name, Info*}: follow OuterRegister."""
        elf = self.elf
        outer, inner = elf.ptr.get(entry), elf.ptr.get(entry + 8)
        if not (elf.in_section(outer, TEXT) and elf.in_section(inner, TEXT)):
            return
        for target in self.lea_targets(outer):
            if target in self.classes:
                return
            if self._is_class_params(target):
                self.classes[target] = TypeDef("class", name[1:], None)
                return
        self.stats["class registrations without params"] += 1

    def _is_class_params(self, base):
        elf = self.elf
        if not elf.in_section(base, RELRO):
            return False
        nums = [elf.i32(base + o) for o in (C_NUMDEPS, C_NUMFUNCS, C_NUMPROPS, C_NUMIFACES)]
        if not (0 <= nums[0] < 64 and 0 <= nums[1] < 8192 and 0 <= nums[2] < 8192 and 0 <= nums[3] < 256):
            return False
        return (
            self._ptr_in(base, TEXT)
            and self._ptr_in(base + C_CONFIG, RODATA, True)
            and (self._ptr_in(base + C_CPPINFO, RODATA, True) or self._ptr_in(base + C_CPPINFO, RELRO))
            and self._ptr_in(base + C_DEPS, RELRO, nullable=(nums[0] == 0))
            and self._ptr_in(base + C_FUNCS, RELRO, nullable=True)
            and self._ptr_in(base + C_PROPS, RELRO, nullable=(nums[2] == 0))
            and self._ptr_in(base + C_IFACES, RELRO, nullable=True)
        )

    # ---- code references -------------------------------------------------------------------------

    def lea_targets(self, func, window=96):
        """Targets of `lea reg, [rip+disp32]` (REX.W 8D /r, mod=00 rm=101) near the start of a function."""
        code = self.elf.code(func, window)
        out = []
        for i in range(len(code) - 6):
            if code[i] in (0x48, 0x4C) and code[i + 1] == 0x8D and (code[i + 2] & 0xC7) == 0x05:
                out.append(func + i + 7 + int.from_bytes(code[i + 3 : i + 7], "little", signed=True))
        if not out and code[:1] == b"\xe9":  # tail-call thunk
            out = self.lea_targets(func + 5 + int.from_bytes(code[1:5], "little", signed=True), window)
        return out

    def resolve(self, func):
        """Map a Z_Construct_* function pointer to the params table it constructs."""
        if func is None:
            return None
        if func not in self._resolved:
            hit = None
            for target in self.lea_targets(func):
                if target in self.structs or target in self.enums or target in self.classes:
                    hit = target
                    break
            self._resolved[func] = hit
        return self._resolved[func]

    # ---- properties ------------------------------------------------------------------------------

    def _load_all_props(self):
        elf = self.elf
        for table, num_off, arr_off in ((self.structs, S_NUMPROPS, S_PROPS), (self.classes, C_NUMPROPS, C_PROPS)):
            for base, td in table.items():
                num = elf.i32(base + num_off)
                td.props = (self._parse_prop_array(elf.ptr[base + arr_off], num) if num else []) or []

    def _parse_prop_array(self, arr, num):
        elf = self.elf
        stack = []
        for k in range(num):
            p = elf.ptr.get(arr + 8 * k)
            name = elf.cstr(elf.ptr.get(p + P_NAME, 0)) if p else None
            if name is None:
                self.stats["unreadable property params"] += 1
                return None
            gen = elf.u8(p + P_GENFLAGS) & 0x3F
            prop = Prop(name, gen, elf.u32(p + P_ARRAYDIM))
            if gen in GEN_WITH_TYPE_PTR:
                prop.type_ptr = elf.ptr.get(p + P_TYPEPTR)
            if gen in (GEN_ARRAY, GEN_SET, GEN_ENUM):
                prop.inner = stack.pop()
            elif gen == GEN_MAP:
                prop.inner = stack.pop()  # key is emitted right before the map
                prop.value = stack.pop()
            stack.append(prop)
        return stack

    def _link(self):
        """Resolve super types and the struct/enum names referenced by properties."""
        for base, td in self.structs.items():
            target = self.resolve(td.super_ptr)
            td.super_name = self.structs[target].name if target in self.structs else None
            if td.super_ptr and td.super_name is None:
                self.stats["unresolved struct supers"] += 1
        for base, td in self.classes.items():
            if self.elf.i32(base + C_NUMDEPS) > 0:
                first_dep = self.elf.ptr.get(self.elf.ptr[base + C_DEPS])
                target = self.resolve(first_dep)
                td.super_name = self.classes[target].name if target in self.classes else None

        def visit(prop):
            for child in (prop.inner, prop.value):
                if child:
                    visit(child)
            if prop.type_ptr is None:
                return
            target = self.resolve(prop.type_ptr)
            if prop.gen == GEN_STRUCT:
                prop.type_name = self.structs[target].name if target in self.structs else None
                self.stats["struct refs resolved" if prop.type_name else "struct refs unresolved"] += 1
            elif prop.gen in (GEN_ENUM, GEN_BYTE):
                prop.type_name = self.enums[target].name if target in self.enums else None
                self.stats["enum refs resolved" if prop.type_name else "enum refs unresolved"] += 1

        for td in list(self.structs.values()) + list(self.classes.values()):
            for prop in td.props:
                visit(prop)
