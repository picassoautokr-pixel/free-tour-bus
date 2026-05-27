# -*- coding: utf-8 -*-
"""Verify modified files are UTF-8 without BOM."""
from pathlib import Path

FILES = [
    r"d:\projects\free-tour-bus\sql\application_selected_price_fix.sql",
    r"d:\projects\free-tour-bus\lib\selected-price-display.ts",
    r"d:\projects\free-tour-bus\app\api\client\quotes\route.ts",
]

for raw in FILES:
    p = Path(raw)
    head = p.read_bytes()[:3]
    has_bom = head == b"\xef\xbb\xbf"
    print(f"{p.name}: BOM={has_bom} bytes={p.stat().st_size}")
