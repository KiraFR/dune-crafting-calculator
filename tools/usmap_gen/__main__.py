"""Generate a .usmap from a stripped UE Linux server binary.

usage: python tools/usmap_gen <server-binary> <out.usmap> [--show StructName ...]
"""
import argparse
import json
import sys
import time
from collections import Counter, defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import usmap  # noqa: E402
from elf import Elf  # noqa: E402
from reflection import Reflection  # noqa: E402

GEN_NAMES = {0x16: "Array", 0x17: "Map", 0x18: "Set", 0x19: "Struct", 0x1E: "Enum", 0x00: "Byte"}


def describe(prop):
    kind = GEN_NAMES.get(prop.gen, f"0x{prop.gen:02x}")
    if prop.gen == 0x17:
        return f"Map<{describe(prop.inner)}, {describe(prop.value)}>"
    if prop.gen in (0x16, 0x18):
        return f"{kind}<{describe(prop.inner)}>"
    if prop.type_name:
        return f"{kind}:{prop.type_name}"
    return kind


def map_struct_types(types):
    """Key/value struct names of every TMap, by property name.

    Tagged (non-unversioned) serialization does not record the struct type of map keys and values, so
    readers such as CUE4Parse need this table. When one property name has several definitions, the most
    common one wins and the count of such names is returned.
    """
    by_name = defaultdict(Counter)
    for td in types:
        for prop in td.props:
            if prop.gen != 0x17:
                continue
            key = prop.inner.type_name if prop.inner.gen == 0x19 else None
            value = prop.value.type_name if prop.value.gen == 0x19 else None
            if key or value:
                by_name[prop.name][(key, value)] += 1
    table = {name: list(counts.most_common(1)[0][0]) for name, counts in sorted(by_name.items())}
    return table, sum(1 for counts in by_name.values() if len(counts) > 1)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("binary")
    parser.add_argument("out")
    parser.add_argument("--map-struct-types", help="also write {property: [keyStruct, valueStruct]} as JSON")
    parser.add_argument("--show", nargs="*", default=[], help="print the recovered schema of these types")
    args = parser.parse_args()

    t0 = time.time()
    elf = Elf(args.binary)
    refl = Reflection(elf)
    refl.discover()
    print(f"structs={len(refl.structs)} classes={len(refl.classes)} enums={len(refl.enums)} ({time.time() - t0:.0f}s)")

    # Duplicate names (e.g. the same struct registered by two modules) keep the first definition.
    seen, types = set(), []
    for td in list(refl.structs.values()) + list(refl.classes.values()):
        if td.name not in seen:
            seen.add(td.name)
            types.append(td)
    enums = list({e.name: e for e in reversed(list(refl.enums.values()))}.values())

    problems = Counter()
    name_count = usmap.write(args.out, enums, types, problems)
    print(f"wrote {args.out}: {len(types)} types, {len(enums)} enums, {name_count} names")
    for key, value in sorted((refl.stats + problems).items()):
        print(f"  {key}: {value}")

    if args.map_struct_types:
        table, conflicts = map_struct_types(types)
        Path(args.map_struct_types).write_text(json.dumps(table, indent=1), encoding="utf-8")
        print(f"wrote {args.map_struct_types}: {len(table)} map properties ({conflicts} names with conflicting types)")

    by_name = {td.name: td for td in types}
    for name in args.show:
        td = by_name.get(name)
        if td is None:
            print(f"\n{name}: not found")
            continue
        print(f"\n{td.kind} {td.name} : {td.super_name}")
        for prop in td.props:
            dim = f"[{prop.array_dim}]" if prop.array_dim > 1 else ""
            print(f"    {prop.name}{dim}: {describe(prop)}")


if __name__ == "__main__":
    main()
