"""Minimal read-only ELF64 reader for x86-64 PIE binaries: sections, relocated pointers, strings, code."""
import struct
from bisect import bisect_right
from dataclasses import dataclass
from pathlib import Path

SHT_NOBITS = 8
R_X86_64_64 = 1
R_X86_64_RELATIVE = 8


@dataclass(frozen=True)
class Section:
    name: str
    type: int
    addr: int
    offset: int
    size: int
    entsize: int

    def contains(self, va: int) -> bool:
        return self.addr <= va < self.addr + self.size


class Elf:
    def __init__(self, path):
        self.data = Path(path).read_bytes()
        d = self.data
        if d[:4] != b"\x7fELF" or d[4] != 2 or d[5] != 1:
            raise ValueError(f"{path}: not a little-endian ELF64 file")
        shoff, = struct.unpack_from("<Q", d, 0x28)
        shentsize, shnum, shstrndx = struct.unpack_from("<HHH", d, 0x3A)
        raw = [struct.unpack_from("<IIQQQQIIQQ", d, shoff + i * shentsize) for i in range(shnum)]
        names = d[raw[shstrndx][4] : raw[shstrndx][4] + raw[shstrndx][5]]
        self.sections = {}
        for s in raw:
            name = names[s[0] : names.index(b"\0", s[0])].decode()
            self.sections[name] = Section(name, s[1], s[3], s[4], s[5], s[9])
        self._mapped = sorted(
            (s for s in self.sections.values() if s.addr and s.type != SHT_NOBITS), key=lambda s: s.addr
        )
        self._starts = [s.addr for s in self._mapped]
        self.ptr = self._load_pointers()

    def _load_pointers(self):
        """Pointer slots filled by the dynamic loader: slot address -> target address."""
        d = self.data
        symbols = None
        dynsym = self.sections.get(".dynsym")
        if dynsym:
            symbols = [
                struct.unpack_from("<IBBHQQ", d, dynsym.offset + i * 24) for i in range(dynsym.size // 24)
            ]
        ptr = {}
        rela = self.sections[".rela.dyn"]
        for off, info, addend in struct.iter_unpack("<QQq", d[rela.offset : rela.offset + rela.size]):
            kind = info & 0xFFFFFFFF
            if kind == R_X86_64_RELATIVE:
                ptr[off] = addend
            elif kind == R_X86_64_64 and symbols:
                sym = symbols[info >> 32]
                if sym[3] != 0:  # defined in this binary
                    ptr[off] = sym[4] + addend
        return ptr

    def section_at(self, va):
        i = bisect_right(self._starts, va) - 1
        if i >= 0 and self._mapped[i].contains(va):
            return self._mapped[i]
        return None

    def offset(self, va):
        s = self.section_at(va)
        return None if s is None else va - s.addr + s.offset

    def in_section(self, va, name):
        s = self.sections.get(name)
        return va is not None and s is not None and s.contains(va)

    def u8(self, va):
        return self.data[self.offset(va)]

    def u16(self, va):
        return struct.unpack_from("<H", self.data, self.offset(va))[0]

    def i32(self, va):
        return struct.unpack_from("<i", self.data, self.offset(va))[0]

    def u32(self, va):
        return struct.unpack_from("<I", self.data, self.offset(va))[0]

    def u64(self, va):
        return struct.unpack_from("<Q", self.data, self.offset(va))[0]

    def i64(self, va):
        return struct.unpack_from("<q", self.data, self.offset(va))[0]

    def cstr(self, va, limit=1024):
        off = self.offset(va)
        if off is None:
            return None
        end = self.data.find(b"\0", off, off + limit)
        if end < 0:
            return None
        try:
            return self.data[off:end].decode("utf-8")
        except UnicodeDecodeError:
            return None

    def utf16(self, va, limit=512):
        """Read a NUL-terminated UTF-16LE string (TCHAR on Linux), or None if it does not look like one."""
        off = self.offset(va)
        if off is None:
            return None
        chars = []
        for i in range(limit):
            lo, hi = self.data[off + 2 * i], self.data[off + 2 * i + 1]
            if lo == 0 and hi == 0:
                return "".join(chars) if chars else None
            if hi != 0 or not (32 <= lo < 127):
                return None
            chars.append(chr(lo))
        return None

    def code(self, va, size):
        off = self.offset(va)
        return b"" if off is None else self.data[off : off + size]
