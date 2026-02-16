#!/usr/bin/env python3
"""Generate a 128x480 RGBA pixel art sprite sheet for a coyote enemy."""

from PIL import Image

SHEET_W, SHEET_H = 128, 480
CELL = 32

# Color palette
TRANSPARENT = (0, 0, 0, 0)
TAN         = (196, 163, 90, 255)    # #C4A35A - base body
DARK_BROWN  = (139, 105, 20, 255)    # #8B6914 - back/top
CREAM       = (232, 213, 160, 255)   # #E8D5A0 - belly/underside
BLACK       = (30, 25, 20, 255)      # nose/eye
EYE_YELLOW  = (220, 200, 60, 255)    # eye highlight
DARK_TAN    = (165, 130, 60, 255)    # shadow/detail
LIGHT_TAN   = (215, 185, 110, 255)   # highlight
TAIL_TIP    = (60, 45, 20, 255)      # dark tail tip
EAR_INNER   = (190, 140, 100, 255)   # inner ear pink-brown

img = Image.new("RGBA", (SHEET_W, SHEET_H), TRANSPARENT)


def px(x, y, color):
    """Set a pixel if within bounds."""
    if 0 <= x < SHEET_W and 0 <= y < SHEET_H:
        img.putpixel((x, y), color)


def draw_coyote_south_detailed(cx, cy, frame, anim="idle"):
    """Draw a detailed south-facing coyote at cell position (cx, cy).
    The coyote is ~18x16 pixels, centered in the 32x32 cell.
    """
    ox, oy = cx + 7, cy + 8

    body_dy = 0
    ear_dy = 0
    leg_phase = 0

    if anim == "idle":
        body_dy = -1 if frame == 1 else 0
        ear_dy = -1 if frame == 1 else 0
    elif anim == "walk":
        body_dy = [0, -1, 0, -1][frame]
        leg_phase = frame
    elif anim == "attack":
        lunge = [0, -2, 4, 2][frame]
        body_dy = lunge
        leg_phase = frame
    elif anim == "death":
        if frame == 1:
            ox += 2
            oy += 2
        elif frame == 2:
            _draw_dead_south(cx, cy)
            return

    by = body_dy
    ey = ear_dy + by

    # === EARS ===
    px(ox + 3, oy + 0 + ey, DARK_BROWN)
    px(ox + 4, oy + 0 + ey, DARK_BROWN)
    px(ox + 3, oy + 1 + ey, DARK_BROWN)
    px(ox + 4, oy + 1 + ey, EAR_INNER)
    px(ox + 13, oy + 0 + ey, DARK_BROWN)
    px(ox + 14, oy + 0 + ey, DARK_BROWN)
    px(ox + 13, oy + 1 + ey, EAR_INNER)
    px(ox + 14, oy + 1 + ey, DARK_BROWN)

    # === HEAD ===
    for x in range(5, 13):
        px(ox + x, oy + 1 + by, DARK_BROWN)
    for x in range(4, 14):
        px(ox + x, oy + 2 + by, TAN)
    px(ox + 4, oy + 2 + by, DARK_BROWN)
    px(ox + 13, oy + 2 + by, DARK_BROWN)

    # Eye row
    for x in range(4, 14):
        px(ox + x, oy + 3 + by, TAN)
    px(ox + 5, oy + 3 + by, BLACK)
    px(ox + 6, oy + 3 + by, EYE_YELLOW)
    px(ox + 11, oy + 3 + by, EYE_YELLOW)
    px(ox + 12, oy + 3 + by, BLACK)

    # Muzzle
    for x in range(5, 13):
        px(ox + x, oy + 4 + by, TAN)
    for x in range(7, 11):
        px(ox + x, oy + 4 + by, CREAM)

    # Nose/mouth
    for x in range(6, 12):
        px(ox + x, oy + 5 + by, CREAM)
    px(ox + 8, oy + 5 + by, BLACK)
    px(ox + 9, oy + 5 + by, BLACK)

    # === NECK ===
    for x in range(5, 13):
        px(ox + x, oy + 6 + by, TAN)
    for x in range(7, 11):
        px(ox + x, oy + 6 + by, CREAM)

    # === BODY ===
    for row in range(7, 12):
        for x in range(4, 14):
            px(ox + x, oy + row + by, TAN)
        px(ox + 4, oy + row + by, DARK_TAN)
        px(ox + 13, oy + row + by, DARK_TAN)
        for x in range(6, 12):
            px(ox + x, oy + row + by, CREAM)
    for x in range(5, 13):
        px(ox + x, oy + 7 + by, DARK_BROWN)
    for x in range(6, 12):
        px(ox + x, oy + 7 + by, TAN)

    # === LEGS ===
    fl_dy = [0, -1, 0, 1][leg_phase]
    bl_dy = [0, 1, 0, -1][leg_phase]

    for y in range(12, 16):
        px(ox + 5, oy + y + by + fl_dy, TAN)
        px(ox + 6, oy + y + by + fl_dy, TAN)
    px(ox + 5, oy + 15 + by + fl_dy, DARK_TAN)
    px(ox + 6, oy + 15 + by + fl_dy, DARK_TAN)

    for y in range(12, 16):
        px(ox + 11, oy + y + by + bl_dy, TAN)
        px(ox + 12, oy + y + by + bl_dy, TAN)
    px(ox + 11, oy + 15 + by + bl_dy, DARK_TAN)
    px(ox + 12, oy + 15 + by + bl_dy, DARK_TAN)


def _draw_dead_south(cx, cy):
    """Flat collapsed coyote facing south."""
    ox, oy = cx + 4, cy + 16
    for x in range(2, 20):
        for y in range(1, 5):
            px(ox + x, oy + y, TAN)
    for x in range(5, 17):
        px(ox + x, oy + 2, DARK_BROWN)
    for x in range(8, 14):
        px(ox + x, oy + 3, CREAM)
    for x in range(17, 22):
        for y in range(0, 3):
            px(ox + x, oy + y, TAN)
    px(ox + 20, oy + 1, BLACK)
    px(ox + 3, oy + 5, DARK_TAN)
    px(ox + 4, oy + 5, DARK_TAN)
    px(ox + 17, oy + 5, DARK_TAN)
    px(ox + 18, oy + 5, DARK_TAN)


def draw_coyote_east_detailed(cx, cy, frame, anim="idle"):
    """Draw a detailed east-facing (right) coyote."""
    ox, oy = cx + 3, cy + 8

    body_dy = 0
    body_dx = 0
    ear_dy = 0
    leg_phase = 0

    if anim == "idle":
        body_dy = -1 if frame == 1 else 0
        ear_dy = -1 if frame == 1 else 0
    elif anim == "walk":
        body_dy = [0, -1, 0, -1][frame]
        leg_phase = frame
    elif anim == "attack":
        body_dx = [0, -2, 5, 2][frame]
        leg_phase = frame
    elif anim == "death":
        if frame == 1:
            ox += 1
            oy += 3
        elif frame == 2:
            _draw_dead_east(cx, cy)
            return

    bx, by = body_dx, body_dy

    # === EAR ===
    px(ox + 11 + bx, oy + 0 + ear_dy + by, DARK_BROWN)
    px(ox + 12 + bx, oy + 0 + ear_dy + by, DARK_BROWN)
    px(ox + 11 + bx, oy + 1 + ear_dy + by, EAR_INNER)
    px(ox + 12 + bx, oy + 1 + ear_dy + by, DARK_BROWN)

    # === HEAD ===
    for x in range(9, 14):
        px(ox + x + bx, oy + 1 + by, DARK_BROWN)
    for x in range(8, 14):
        px(ox + x + bx, oy + 2 + by, TAN)
    px(ox + 8 + bx, oy + 2 + by, DARK_BROWN)

    for x in range(8, 16):
        px(ox + x + bx, oy + 3 + by, TAN)
    px(ox + 12 + bx, oy + 3 + by, BLACK)
    px(ox + 13 + bx, oy + 3 + by, EYE_YELLOW)

    for x in range(9, 18):
        px(ox + x + bx, oy + 4 + by, TAN)
    for x in range(14, 18):
        px(ox + x + bx, oy + 4 + by, CREAM)

    for x in range(11, 19):
        px(ox + x + bx, oy + 5 + by, TAN)
    for x in range(15, 18):
        px(ox + x + bx, oy + 5 + by, CREAM)
    px(ox + 18 + bx, oy + 5 + by, BLACK)
    px(ox + 18 + bx, oy + 4 + by, BLACK)

    # === NECK ===
    for x in range(7, 13):
        px(ox + x + bx, oy + 6 + by, TAN)
    px(ox + 7 + bx, oy + 6 + by, DARK_BROWN)

    # === BODY ===
    for row in range(7, 12):
        for x in range(3, 14):
            px(ox + x + bx, oy + row + by, TAN)
        if row == 7:
            for x in range(4, 13):
                px(ox + x + bx, oy + row + by, DARK_BROWN)
        if row >= 10:
            for x in range(5, 12):
                px(ox + x + bx, oy + row + by, CREAM)

    for x in range(4, 13):
        px(ox + x + bx, oy + 8 + by, DARK_BROWN)
    for x in range(5, 12):
        px(ox + x + bx, oy + 8 + by, TAN)

    # === TAIL ===
    tail_dy = [0, -1, 0, 1][leg_phase]
    px(ox + 2 + bx, oy + 8 + by + tail_dy, TAN)
    px(ox + 1 + bx, oy + 8 + by + tail_dy, DARK_TAN)
    px(ox + 0 + bx, oy + 7 + by + tail_dy, DARK_TAN)
    px(ox - 1 + bx, oy + 7 + by + tail_dy, TAIL_TIP)
    px(ox - 2 + bx, oy + 6 + by + tail_dy, TAIL_TIP)
    px(ox + 1 + bx, oy + 9 + by + tail_dy, TAN)
    px(ox + 2 + bx, oy + 9 + by + tail_dy, TAN)

    # === LEGS ===
    fl_dy = [0, -2, 0, 2][leg_phase]
    bl_dy = [0, 2, 0, -2][leg_phase]

    for y in range(12, 16):
        px(ox + 11 + bx, oy + y + by + fl_dy, TAN)
        px(ox + 12 + bx, oy + y + by + fl_dy, TAN)
    px(ox + 11 + bx, oy + 15 + by + fl_dy, DARK_TAN)
    px(ox + 12 + bx, oy + 15 + by + fl_dy, DARK_TAN)

    for y in range(12, 16):
        px(ox + 5 + bx, oy + y + by + bl_dy, TAN)
        px(ox + 6 + bx, oy + y + by + bl_dy, TAN)
    px(ox + 5 + bx, oy + 15 + by + bl_dy, DARK_TAN)
    px(ox + 6 + bx, oy + 15 + by + bl_dy, DARK_TAN)


def _draw_dead_east(cx, cy):
    """Flat collapsed coyote facing east."""
    ox, oy = cx + 3, cy + 17
    for x in range(2, 22):
        for y in range(1, 4):
            px(ox + x, oy + y, TAN)
    for x in range(4, 20):
        px(ox + x, oy + 1, DARK_BROWN)
    for x in range(6, 18):
        px(ox + x, oy + 3, CREAM)
    for x in range(19, 24):
        px(ox + x, oy + 1, TAN)
        px(ox + x, oy + 2, TAN)
    px(ox + 23, oy + 2, BLACK)
    px(ox + 1, oy + 2, DARK_TAN)
    px(ox + 0, oy + 2, TAIL_TIP)
    px(ox + 7, oy + 4, DARK_TAN)
    px(ox + 8, oy + 4, DARK_TAN)
    px(ox + 15, oy + 4, DARK_TAN)
    px(ox + 16, oy + 4, DARK_TAN)


def draw_coyote_north_detailed(cx, cy, frame, anim="idle"):
    """Draw a detailed north-facing (up/away) coyote."""
    ox, oy = cx + 7, cy + 8

    body_dy = 0
    ear_dy = 0
    leg_phase = 0

    if anim == "idle":
        body_dy = -1 if frame == 1 else 0
        ear_dy = -1 if frame == 1 else 0
    elif anim == "walk":
        body_dy = [0, -1, 0, -1][frame]
        leg_phase = frame
    elif anim == "attack":
        lunge = [0, 2, -4, -2][frame]
        body_dy = lunge
        leg_phase = frame
    elif anim == "death":
        if frame == 1:
            ox -= 2
            oy += 2
        elif frame == 2:
            _draw_dead_north(cx, cy)
            return

    by = body_dy
    ey = ear_dy + by

    # === EARS ===
    px(ox + 3, oy + 0 + ey, DARK_BROWN)
    px(ox + 4, oy + 0 + ey, DARK_BROWN)
    px(ox + 3, oy + 1 + ey, DARK_BROWN)
    px(ox + 4, oy + 1 + ey, DARK_BROWN)
    px(ox + 13, oy + 0 + ey, DARK_BROWN)
    px(ox + 14, oy + 0 + ey, DARK_BROWN)
    px(ox + 13, oy + 1 + ey, DARK_BROWN)
    px(ox + 14, oy + 1 + ey, DARK_BROWN)

    # === HEAD (back view) ===
    for x in range(5, 13):
        px(ox + x, oy + 1 + by, DARK_BROWN)
    for x in range(4, 14):
        px(ox + x, oy + 2 + by, DARK_BROWN)
    for x in range(4, 14):
        px(ox + x, oy + 3 + by, DARK_BROWN)
    for x in range(5, 13):
        px(ox + x, oy + 4 + by, TAN)
    for x in range(6, 12):
        px(ox + x, oy + 5 + by, TAN)

    # === NECK ===
    for x in range(5, 13):
        px(ox + x, oy + 6 + by, DARK_BROWN)
    for x in range(6, 12):
        px(ox + x, oy + 6 + by, TAN)

    # === BODY ===
    for row in range(7, 12):
        for x in range(4, 14):
            px(ox + x, oy + row + by, TAN)
        px(ox + 4, oy + row + by, DARK_TAN)
        px(ox + 13, oy + row + by, DARK_TAN)

    for row in range(7, 10):
        for x in range(5, 13):
            px(ox + x, oy + row + by, DARK_BROWN)
        for x in range(6, 12):
            px(ox + x, oy + row + by, TAN)
    px(ox + 8, oy + 7 + by, DARK_BROWN)
    px(ox + 9, oy + 7 + by, DARK_BROWN)
    px(ox + 8, oy + 8 + by, DARK_BROWN)
    px(ox + 9, oy + 8 + by, DARK_BROWN)

    # === TAIL ===
    tail_sway = [0, 1, 0, -1][leg_phase]
    px(ox + 8 + tail_sway, oy + 12 + by, TAN)
    px(ox + 9 + tail_sway, oy + 12 + by, TAN)
    px(ox + 8 + tail_sway, oy + 13 + by, DARK_TAN)
    px(ox + 9 + tail_sway, oy + 13 + by, DARK_TAN)
    px(ox + 8 + tail_sway, oy + 14 + by, TAIL_TIP)
    px(ox + 9 + tail_sway, oy + 14 + by, TAIL_TIP)

    # === LEGS ===
    fl_dy = [0, -1, 0, 1][leg_phase]
    bl_dy = [0, 1, 0, -1][leg_phase]

    for y in range(12, 16):
        px(ox + 5, oy + y + by + fl_dy, TAN)
        px(ox + 6, oy + y + by + fl_dy, TAN)
    px(ox + 5, oy + 15 + by + fl_dy, DARK_TAN)
    px(ox + 6, oy + 15 + by + fl_dy, DARK_TAN)

    for y in range(12, 16):
        px(ox + 11, oy + y + by + bl_dy, TAN)
        px(ox + 12, oy + y + by + bl_dy, TAN)
    px(ox + 11, oy + 15 + by + bl_dy, DARK_TAN)
    px(ox + 12, oy + 15 + by + bl_dy, DARK_TAN)


def _draw_dead_north(cx, cy):
    """Flat collapsed coyote from back view."""
    ox, oy = cx + 4, cy + 16
    for x in range(2, 20):
        for y in range(1, 5):
            px(ox + x, oy + y, DARK_BROWN)
    for x in range(5, 17):
        px(ox + x, oy + 2, TAN)
    for x in range(5, 17):
        px(ox + x, oy + 3, TAN)
    for x in range(0, 5):
        for y in range(0, 3):
            px(ox + x, oy + y, DARK_BROWN)
    px(ox + 10, oy + 5, DARK_TAN)
    px(ox + 10, oy + 6, TAIL_TIP)
    px(ox + 3, oy + 5, DARK_TAN)
    px(ox + 4, oy + 5, DARK_TAN)
    px(ox + 17, oy + 5, DARK_TAN)
    px(ox + 18, oy + 5, DARK_TAN)


# ============================================================
# MAIN: Populate the sprite sheet
# ============================================================

# --- IDLE (rows 0-2), 2 frames ---
for f in range(2):
    draw_coyote_south_detailed(f * CELL, 0 * CELL, f, "idle")
for f in range(2):
    draw_coyote_east_detailed(f * CELL, 1 * CELL, f, "idle")
for f in range(2):
    draw_coyote_north_detailed(f * CELL, 2 * CELL, f, "idle")

# --- WALK (rows 3-5), 4 frames ---
for f in range(4):
    draw_coyote_south_detailed(f * CELL, 3 * CELL, f, "walk")
for f in range(4):
    draw_coyote_east_detailed(f * CELL, 4 * CELL, f, "walk")
for f in range(4):
    draw_coyote_north_detailed(f * CELL, 5 * CELL, f, "walk")

# --- ROWS 6-8 UNUSED (left blank/transparent) ---

# --- DEATH (rows 9-11), 3 frames ---
for f in range(3):
    draw_coyote_south_detailed(f * CELL, 9 * CELL, f, "death")
for f in range(3):
    draw_coyote_east_detailed(f * CELL, 10 * CELL, f, "death")
for f in range(3):
    draw_coyote_north_detailed(f * CELL, 11 * CELL, f, "death")

# --- ATTACK (rows 12-14), 4 frames ---
for f in range(4):
    draw_coyote_south_detailed(f * CELL, 12 * CELL, f, "attack")
for f in range(4):
    draw_coyote_east_detailed(f * CELL, 13 * CELL, f, "attack")
for f in range(4):
    draw_coyote_north_detailed(f * CELL, 14 * CELL, f, "attack")

# Save
output_path = "/Users/jackson/Code/games/high-noon/packages/client/public/assets/sprites/enemies/coyote.png"
img.save(output_path)
print(f"Saved sprite sheet to {output_path}")
print(f"Size: {img.size}, Mode: {img.mode}")

# Verify
verify = Image.open(output_path)
print(f"Verified: {verify.size}, {verify.mode}")

# Count non-transparent pixels per row of cells
for row_idx in range(15):
    count = 0
    for y in range(row_idx * CELL, (row_idx + 1) * CELL):
        for x in range(SHEET_W):
            if img.getpixel((x, y))[3] > 0:
                count += 1
    row_names = [
        "idle-S", "idle-E", "idle-N",
        "walk-S", "walk-E", "walk-N",
        "(unused)", "(unused)", "(unused)",
        "death-S", "death-E", "death-N",
        "attack-S", "attack-E", "attack-N"
    ]
    print(f"  Row {row_idx:2d} ({row_names[row_idx]:>10s}): {count:4d} pixels")
