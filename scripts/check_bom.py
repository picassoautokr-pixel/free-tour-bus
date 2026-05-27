# -*- coding: utf-8 -*-
"""Verify modified files are UTF-8 without BOM."""
from pathlib import Path

FILES = [
    r"d:\projects\free-tour-bus\sql\application_selected_price_fix.sql",
    r"d:\projects\free-tour-bus\lib\selected-price-display.ts",
    r"d:\projects\free-tour-bus\app\api\client\quotes\route.ts",
    r"d:\projects\free-tour-bus\lib\status-normalizer.ts",
    r"d:\projects\free-tour-bus\lib\status-normalizer.test.ts",
    r"d:\projects\free-tour-bus\lib\quote-support-display-model.ts",
    r"d:\projects\free-tour-bus\lib\partner-call-view-model.ts",
    r"d:\projects\free-tour-bus\lib\admin-progress-stage.ts",
]

for raw in FILES:
    p = Path(raw)
    head = p.read_bytes()[:3]
    has_bom = head == b"\xef\xbb\xbf"
    print(f"{p.name}: BOM={has_bom} bytes={p.stat().st_size}")
