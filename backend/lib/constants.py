from __future__ import annotations

# Carrier colors are the fallback when a carrier row has no 'color' field.
# The sample workbook (data/sample_model.json) is the primary source of colors.
CARRIER_COLORS: dict[str, str] = {
    "LNG": "#1f4e79",
    "Coal": "#374151",
    "Nuclear": "#7c3aed",
    "Solar": "#f59e0b",
    "Wind": "#0f766e",
    "Hydro": "#2563eb",
    "Storage": "#14b8a6",
    "Imports": "#dc2626",
    "LoadShedding": "#991b1b",
}
