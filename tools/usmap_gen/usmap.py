"""Write .usmap mapping files in the layout read by CUE4Parse's UsmapParser (version ExplicitEnumValues)."""
import struct

from reflection import GEN_BYTE, GEN_ENUM, GEN_STRUCT

MAGIC = 0x30C4
VERSION_EXPLICIT_ENUM_VALUES = 4  # implies LongFName (u16 name length) and LargeEnums (u16 entry count)
COMPRESSION_NONE = 0

# CUE4Parse EPropertyType
BYTE, BOOL, INT, FLOAT, OBJECT, NAME, DELEGATE, DOUBLE, ARRAY, STRUCT, STR, TEXT, INTERFACE = range(13)
MULTICAST_DELEGATE, WEAK_OBJECT, LAZY_OBJECT, ASSET_OBJECT, SOFT_OBJECT = range(13, 18)
UINT64, UINT32, UINT16, INT64, INT16, INT8, MAP, SET, ENUM, FIELD_PATH = range(18, 28)

# EPropertyGenFlags type code -> usmap property type. Class/SoftClass serialize exactly like their object
# counterparts, and LWC reals like doubles, so the older, universally supported tags are used.
GEN_TO_USMAP = {
    0x00: BYTE, 0x01: INT8, 0x02: INT16, 0x03: INT, 0x04: INT64, 0x05: UINT16, 0x06: UINT32, 0x07: UINT64,
    0x0A: FLOAT, 0x0B: DOUBLE, 0x0C: BOOL, 0x0D: SOFT_OBJECT, 0x0E: WEAK_OBJECT, 0x0F: LAZY_OBJECT,
    0x10: SOFT_OBJECT, 0x11: OBJECT, 0x12: OBJECT, 0x13: INTERFACE, 0x14: NAME, 0x15: STR, 0x16: ARRAY,
    0x17: MAP, 0x18: SET, 0x19: STRUCT, 0x1A: DELEGATE, 0x1B: MULTICAST_DELEGATE, 0x1C: MULTICAST_DELEGATE,
    0x1D: TEXT, 0x1E: ENUM, 0x1F: FIELD_PATH, 0x20: DOUBLE,
}


class _Names:
    def __init__(self):
        self.index: dict[str, int] = {}

    def __call__(self, name):
        if name is None:
            return -1
        if name not in self.index:
            self.index[name] = len(self.index)
        return self.index[name]


def _write_type(out, prop, names, problems):
    kind = GEN_TO_USMAP.get(prop.gen)
    if kind is None:
        problems[f"unknown gen type 0x{prop.gen:02x}"] += 1
        kind = BYTE
    if prop.gen == GEN_BYTE and prop.type_name:  # TEnumAsByte / byte-backed UENUM
        out += struct.pack("<B", ENUM)
        out += struct.pack("<B", BYTE)
        out += struct.pack("<i", names(prop.type_name))
        return
    if prop.gen == GEN_ENUM and not prop.type_name:
        problems["enum written as its underlying integer"] += 1
        _write_type(out, prop.inner, names, problems)
        return
    out += struct.pack("<B", kind)
    if kind == ENUM:
        _write_type(out, prop.inner, names, problems)
        out += struct.pack("<i", names(prop.type_name))
    elif kind == STRUCT:
        if not prop.type_name:
            problems["struct with unknown type"] += 1
        out += struct.pack("<i", names(prop.type_name or "Unknown"))
    elif kind in (ARRAY, SET):
        _write_type(out, prop.inner, names, problems)
    elif kind == MAP:
        _write_type(out, prop.inner, names, problems)
        _write_type(out, prop.value, names, problems)


def write(path, enums, types, problems):
    names = _Names()
    body = bytearray()

    body += struct.pack("<I", len(enums))
    for enum in enums:
        body += struct.pack("<iH", names(enum.name), len(enum.entries))
        for entry_name, value in enum.entries:
            body += struct.pack("<Qi", value & 0xFFFFFFFFFFFFFFFF, names(entry_name))

    body += struct.pack("<I", len(types))
    for td in types:
        prop_count = sum(max(p.array_dim, 1) for p in td.props)
        body += struct.pack("<iiHH", names(td.name), names(td.super_name), prop_count, len(td.props))
        index = 0
        for prop in td.props:
            dim = max(prop.array_dim, 1)
            body += struct.pack("<HBi", index, dim, names(prop.name))
            _write_type(body, prop, names, problems)
            index += dim

    name_table = bytearray(struct.pack("<I", len(names.index)))
    for name in names.index:
        raw = name.encode("utf-8")
        name_table += struct.pack("<H", len(raw)) + raw

    data = bytes(name_table + body)
    header = struct.pack("<HBiBII", MAGIC, VERSION_EXPLICIT_ENUM_VALUES, 0, COMPRESSION_NONE, len(data), len(data))
    with open(path, "wb") as f:
        f.write(header + data)
    return len(names.index)
