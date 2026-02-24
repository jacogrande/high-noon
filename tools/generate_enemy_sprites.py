#!/usr/bin/env python3
"""
Generate pixel art sprite sheets for Sprint 18 enemies.

Each sprite sheet is 128x480 (4 cols x 15 rows of 32x32 cells).
Layout:
  Rows 0-2:   Idle   (2 frames) — S, E, N
  Rows 3-5:   Walk   (4 frames) — S, E, N
  Rows 6-8:   Reserved (empty)
  Rows 9-11:  Death  (3 frames) — S, E, N
  Rows 12-14: Attack (4 frames) — S, E, N
"""

from PIL import Image
import os

CELL = 32
COLS = 4
ROWS = 15
WIDTH = CELL * COLS    # 128
HEIGHT = CELL * ROWS   # 480
SPRITE_DIR = os.path.join(os.path.dirname(__file__),
    '..', 'packages', 'client', 'public', 'assets', 'sprites', 'enemies')

TRANSPARENT = (0, 0, 0, 0)


def parse_grid(lines, palette):
    """Parse a list of strings into {(x,y): (r,g,b,a)} pixel dict."""
    pixels = {}
    for y, line in enumerate(lines):
        for x, ch in enumerate(line):
            if ch != '.' and ch in palette:
                pixels[(x, y)] = palette[ch]
    return pixels


def place(img, pixels, col, row, ox=0, oy=0):
    """Stamp pixel dict into sprite sheet cell (col, row) with offset."""
    bx = col * CELL + ox
    by = row * CELL + oy
    for (px, py), color in pixels.items():
        fx, fy = bx + px, by + py
        if 0 <= fx < WIDTH and 0 <= fy < HEIGHT:
            img.putpixel((fx, fy), color)


def shift(pixels, dx, dy):
    """Return pixels shifted by (dx, dy)."""
    return {(x + dx, y + dy): c for (x, y), c in pixels.items()}


def flip_h(pixels, w):
    """Horizontally flip pixels within width w."""
    return {(w - 1 - x, y): c for (x, y), c in pixels.items()}


def make_sheet():
    return Image.new('RGBA', (WIDTH, HEIGHT), TRANSPARENT)


def save_sheet(img, name):
    path = os.path.join(SPRITE_DIR, f'{name}.png')
    img.save(path)
    print(f'  Saved {path}')


# ─── Helper: place a full animation set ──────────────────────────────────
def place_anim(img, frames, row, ox, oy):
    """Place list of pixel-dicts into cells (0..len-1) of given row."""
    for i, f in enumerate(frames):
        place(img, f, i, row, ox, oy)


# ═══════════════════════════════════════════════════════════════════════════
# LASSO BANDIT — Cowboy with wide hat and rope coil
# ═══════════════════════════════════════════════════════════════════════════
def generate_lasso_bandit():
    img = make_sheet()

    P = {
        'o': (60, 40, 20, 255),       # dark outline
        'H': (160, 120, 40, 255),      # hat brown
        'h': (130, 95, 30, 255),       # hat dark
        'S': (210, 170, 120, 255),     # skin
        's': (180, 140, 95, 255),      # skin shadow
        'B': (140, 100, 50, 255),      # vest brown
        'b': (110, 75, 35, 255),       # vest dark
        'P': (80, 55, 30, 255),        # pants
        'p': (60, 40, 20, 255),        # pants dark
        'R': (190, 160, 90, 255),      # rope/lasso
        'r': (160, 130, 70, 255),      # rope dark
        'E': (30, 20, 10, 255),        # eyes
        'W': (220, 200, 160, 255),     # shirt white
    }

    # ── South idle ──
    s_idle0 = parse_grid([
        '..oHHHHHo..',
        '..ohhhhho..',
        '...oHHHo...',
        '...oSSSo...',
        '...sEsEso..',
        '...oSSSo...',
        '..oBWBWBo..',
        '..oBBBBBo..',
        '...oBBBo...',
        '...oPPPo...',
        '...oP.Po...',
        '...op.po...',
    ], P)

    s_idle1 = shift(s_idle0, 0, 1)

    # Walk: legs alternate
    s_walk0 = s_idle0
    s_walk1 = parse_grid([
        '..oHHHHHo..',
        '..ohhhhho..',
        '...oHHHo...',
        '...oSSSo...',
        '...sEsEso..',
        '...oSSSo...',
        '..oBWBWBo..',
        '..oBBBBBo..',
        '...oBBBo...',
        '...oPPPo...',
        '..oP..Po...',
        '..op..po...',
    ], P)
    s_walk2 = s_idle0
    s_walk3 = parse_grid([
        '..oHHHHHo..',
        '..ohhhhho..',
        '...oHHHo...',
        '...oSSSo...',
        '...sEsEso..',
        '...oSSSo...',
        '..oBWBWBo..',
        '..oBBBBBo..',
        '...oBBBo...',
        '...oPPPo...',
        '...Po.oP...',
        '...po.op...',
    ], P)

    # Death
    s_death0 = s_idle0
    s_death1 = parse_grid([
        '............',
        '..oHHHHHo..',
        '..ohhhhho..',
        '...oHHHo...',
        '...oSSSo...',
        '..oBBBBBo..',
        '..oBBBBBo..',
        '...oPPPo...',
        '...opppo...',
        '............',
        '............',
        '............',
    ], P)
    s_death2 = parse_grid([
        '............',
        '............',
        '............',
        '............',
        '............',
        '............',
        '............',
        '............',
        '.ohhBBBppo.',
        '.oHHBBBPPo.',
        '.oooooooooo',
        '............',
    ], P)

    # Attack — lasso throw
    s_atk0 = parse_grid([
        '..oHHHHHo..',
        '..ohhhhho..',
        '...oHHHo...',
        '...oSSSo...',
        '...sEsEso..',
        '...oSSSo...',
        '.RoBWBWBo..',
        '.RoBBBBBo..',
        '...oBBBo...',
        '...oPPPo...',
        '...oP.Po...',
        '...op.po...',
    ], P)
    s_atk1 = parse_grid([
        '..oHHHHHo..',
        '..ohhhhho..',
        '...oHHHo...',
        '..RoSSSo...',
        '.R.sEsEso..',
        '...oSSSo...',
        '..oBWBWBo..',
        '..oBBBBBo..',
        '...oBBBo...',
        '...oPPPo...',
        '...oP.Po...',
        '...op.po...',
    ], P)
    s_atk2 = parse_grid([
        '.RRoHHHHHo.',
        '..Rohhhhho.',
        '...oHHHo...',
        '...oSSSoRR.',
        '...sEsEso..',
        '...oSSSo...',
        '..oBWBWBo..',
        '..oBBBBBo..',
        '...oBBBo...',
        '...oPPPo...',
        '...oP.Po...',
        '...op.po...',
    ], P)
    s_atk3 = s_atk1

    # ── East idle ──
    e_idle0 = parse_grid([
        '..oHHHHo...',
        '..ohhhho...',
        '...oHHo....',
        '...oSSo....',
        '...oSEo....',
        '...oSSo....',
        '..oBBBo....',
        '..oBBBo....',
        '...oBBo....',
        '...oPPo....',
        '...oPo.....',
        '...opo.....',
    ], P)
    e_idle1 = shift(e_idle0, 0, 1)

    e_walk0 = e_idle0
    e_walk1 = parse_grid([
        '..oHHHHo...',
        '..ohhhho...',
        '...oHHo....',
        '...oSSo....',
        '...oSEo....',
        '...oSSo....',
        '..oBBBo....',
        '..oBBBo....',
        '...oBBo....',
        '...oPPo....',
        '..oPoPo....',
        '..opooo....',
    ], P)
    e_walk2 = e_idle0
    e_walk3 = parse_grid([
        '..oHHHHo...',
        '..ohhhho...',
        '...oHHo....',
        '...oSSo....',
        '...oSEo....',
        '...oSSo....',
        '..oBBBo....',
        '..oBBBo....',
        '...oBBo....',
        '...oPPo....',
        '...oPoP....',
        '...oooopo..',
    ], P)

    e_death0 = e_idle0
    e_death1 = parse_grid([
        '............',
        '..oHHHHo...',
        '..ohhhho...',
        '...oSSo....',
        '..oBBBo....',
        '..oBBBo....',
        '...oPPo....',
        '...oppo....',
        '............',
        '............',
        '............',
        '............',
    ], P)
    e_death2 = parse_grid([
        '............',
        '............',
        '............',
        '............',
        '............',
        '............',
        '............',
        '............',
        '.oHhSSBBPo.',
        '.ooooooooo.',
        '............',
        '............',
    ], P)

    e_atk0 = parse_grid([
        '..oHHHHo...',
        '..ohhhho...',
        '...oHHo....',
        '...oSSo....',
        '...oSEo....',
        '...oSSo....',
        '..oBBBoR...',
        '..oBBBo....',
        '...oBBo....',
        '...oPPo....',
        '...oPo.....',
        '...opo.....',
    ], P)
    e_atk1 = parse_grid([
        '..oHHHHo...',
        '..ohhhho...',
        '...oHHo....',
        '...oSSo....',
        '...oSEo....',
        '...oSSo.R..',
        '..oBBBoR...',
        '..oBBBo....',
        '...oBBo....',
        '...oPPo....',
        '...oPo.....',
        '...opo.....',
    ], P)
    e_atk2 = parse_grid([
        '..oHHHHo...',
        '..ohhhho...',
        '...oHHo....',
        '...oSSo..RR',
        '...oSEoRR..',
        '...oSSo....',
        '..oBBBo....',
        '..oBBBo....',
        '...oBBo....',
        '...oPPo....',
        '...oPo.....',
        '...opo.....',
    ], P)
    e_atk3 = e_atk1

    # ── North idle ──
    n_idle0 = parse_grid([
        '..oHHHHHo..',
        '..ohhhhho..',
        '...oHHHo...',
        '...ohhho...',
        '...ohhho...',
        '...ohhho...',
        '..obBbBbo..',
        '..oBBBBBo..',
        '...oBBBo...',
        '...oPPPo...',
        '...oP.Po...',
        '...op.po...',
    ], P)
    n_idle1 = shift(n_idle0, 0, 1)

    n_walk0 = n_idle0
    n_walk1 = parse_grid([
        '..oHHHHHo..',
        '..ohhhhho..',
        '...oHHHo...',
        '...ohhho...',
        '...ohhho...',
        '...ohhho...',
        '..obBbBbo..',
        '..oBBBBBo..',
        '...oBBBo...',
        '...oPPPo...',
        '..oP..Po...',
        '..op..po...',
    ], P)
    n_walk2 = n_idle0
    n_walk3 = parse_grid([
        '..oHHHHHo..',
        '..ohhhhho..',
        '...oHHHo...',
        '...ohhho...',
        '...ohhho...',
        '...ohhho...',
        '..obBbBbo..',
        '..oBBBBBo..',
        '...oBBBo...',
        '...oPPPo...',
        '...Po.oP...',
        '...po.op...',
    ], P)

    n_death0 = n_idle0
    n_death1 = s_death1
    n_death2 = s_death2

    n_atk0 = parse_grid([
        '..oHHHHHo..',
        '..ohhhhho..',
        '...oHHHo...',
        '...ohhho...',
        '...ohhho...',
        '...ohhho...',
        'R.obBbBbo..',
        'R.oBBBBBo..',
        '...oBBBo...',
        '...oPPPo...',
        '...oP.Po...',
        '...op.po...',
    ], P)
    n_atk1 = n_atk0
    n_atk2 = parse_grid([
        '.RRoHHHHHo.',
        '..Rohhhhho.',
        '...oHHHo...',
        '...ohhhoRR.',
        '...ohhho...',
        '...ohhho...',
        '..obBbBbo..',
        '..oBBBBBo..',
        '...oBBBo...',
        '...oPPPo...',
        '...oP.Po...',
        '...op.po...',
    ], P)
    n_atk3 = n_atk1

    ox, oy = 10, 10

    # Idle: rows 0-2
    place_anim(img, [s_idle0, s_idle1], 0, ox, oy)
    place_anim(img, [e_idle0, e_idle1], 1, ox, oy)
    place_anim(img, [n_idle0, n_idle1], 2, ox, oy)

    # Walk: rows 3-5
    place_anim(img, [s_walk0, s_walk1, s_walk2, s_walk3], 3, ox, oy)
    place_anim(img, [e_walk0, e_walk1, e_walk2, e_walk3], 4, ox, oy)
    place_anim(img, [n_walk0, n_walk1, n_walk2, n_walk3], 5, ox, oy)

    # Death: rows 9-11
    place_anim(img, [s_death0, s_death1, s_death2], 9, ox, oy)
    place_anim(img, [e_death0, e_death1, e_death2], 10, ox, oy)
    place_anim(img, [n_death0, n_death1, n_death2], 11, ox, oy)

    # Attack: rows 12-14
    place_anim(img, [s_atk0, s_atk1, s_atk2, s_atk3], 12, ox, oy)
    place_anim(img, [e_atk0, e_atk1, e_atk2, e_atk3], 13, ox, oy)
    place_anim(img, [n_atk0, n_atk1, n_atk2, n_atk3], 14, ox, oy)

    save_sheet(img, 'lasso_bandit')


# ═══════════════════════════════════════════════════════════════════════════
# DYNAMITE TOSSER — Masked outlaw with dynamite
# ═══════════════════════════════════════════════════════════════════════════
def generate_dynamite_tosser():
    img = make_sheet()

    P = {
        'o': (50, 30, 10, 255),        # dark outline
        'H': (180, 50, 20, 255),        # bandana red
        'h': (140, 35, 15, 255),        # bandana dark
        'S': (210, 170, 120, 255),      # skin
        's': (180, 140, 95, 255),       # skin shadow
        'B': (200, 120, 40, 255),       # vest orange
        'b': (160, 90, 25, 255),        # vest dark
        'P': (70, 50, 30, 255),         # pants dark
        'p': (50, 35, 20, 255),         # pants darker
        'D': (200, 60, 30, 255),        # dynamite red
        'd': (160, 140, 50, 255),       # dynamite fuse yellow
        'E': (30, 20, 10, 255),         # eyes
        'W': (240, 200, 100, 255),      # spark/fuse glow
    }

    s_idle0 = parse_grid([
        '...oHHHo...',
        '...oHHHo...',
        '...oSSSo...',
        '...sEsEso..',
        '...oHHHo...',
        '..oBBBBBo..',
        '..obBBBbo..',
        '...oBBBo...',
        '...oPPPo...',
        '...oP.Po...',
        '...op.po...',
    ], P)
    s_idle1 = shift(s_idle0, 0, 1)

    s_walk0 = s_idle0
    s_walk1 = parse_grid([
        '...oHHHo...',
        '...oHHHo...',
        '...oSSSo...',
        '...sEsEso..',
        '...oHHHo...',
        '..oBBBBBo..',
        '..obBBBbo..',
        '...oBBBo...',
        '...oPPPo...',
        '..oP..Po...',
        '..op..po...',
    ], P)
    s_walk2 = s_idle0
    s_walk3 = parse_grid([
        '...oHHHo...',
        '...oHHHo...',
        '...oSSSo...',
        '...sEsEso..',
        '...oHHHo...',
        '..oBBBBBo..',
        '..obBBBbo..',
        '...oBBBo...',
        '...oPPPo...',
        '...Po.oP...',
        '...po.op...',
    ], P)

    s_death0 = s_idle0
    s_death1 = parse_grid([
        '............',
        '...oHHHo...',
        '...oHHHo...',
        '...oSSSo...',
        '..oBBBBBo..',
        '..obBBBbo..',
        '...oPPPo...',
        '...opppo...',
        '............',
        '............',
        '............',
    ], P)
    s_death2 = parse_grid([
        '............',
        '............',
        '............',
        '............',
        '............',
        '............',
        '............',
        '............',
        '.oHHBBBPPo.',
        '.ooooooooo.',
        '............',
    ], P)

    s_atk0 = parse_grid([
        '...oHHHo...',
        '...oHHHo...',
        '...oSSSo...',
        '...sEsEso..',
        '...oHHHo...',
        '..oBBBBBo..',
        '..obBBBboD.',
        '...oBBBo.d.',
        '...oPPPo...',
        '...oP.Po...',
        '...op.po...',
    ], P)
    s_atk1 = parse_grid([
        '...oHHHo...',
        '...oHHHo...',
        '...oSSSo.W.',
        '...sEsEsoDd',
        '...oHHHo...',
        '..oBBBBBo..',
        '..obBBBbo..',
        '...oBBBo...',
        '...oPPPo...',
        '...oP.Po...',
        '...op.po...',
    ], P)
    s_atk2 = parse_grid([
        '........W..',
        '...oHHHoDd.',
        '...oHHHo...',
        '...oSSSo...',
        '...sEsEso..',
        '...oHHHo...',
        '..oBBBBBo..',
        '..obBBBbo..',
        '...oBBBo...',
        '...oPPPo...',
        '...oP.Po...',
    ], P)
    s_atk3 = s_atk1

    # East
    e_idle0 = parse_grid([
        '...oHHo....',
        '...oHHo....',
        '...oSSo....',
        '...oSEo....',
        '...oHHo....',
        '..oBBBo....',
        '..obBBo....',
        '...oBBo....',
        '...oPPo....',
        '...oPo.....',
        '...opo.....',
    ], P)
    e_idle1 = shift(e_idle0, 0, 1)

    e_walk0 = e_idle0
    e_walk1 = parse_grid([
        '...oHHo....',
        '...oHHo....',
        '...oSSo....',
        '...oSEo....',
        '...oHHo....',
        '..oBBBo....',
        '..obBBo....',
        '...oBBo....',
        '...oPPo....',
        '..oPoPo....',
        '..opooo....',
    ], P)
    e_walk2 = e_idle0
    e_walk3 = parse_grid([
        '...oHHo....',
        '...oHHo....',
        '...oSSo....',
        '...oSEo....',
        '...oHHo....',
        '..oBBBo....',
        '..obBBo....',
        '...oBBo....',
        '...oPPo....',
        '...oPoP....',
        '...oooopo..',
    ], P)

    e_death0 = e_idle0
    e_death1 = parse_grid([
        '............',
        '...oHHo....',
        '...oHHo....',
        '...oSSo....',
        '..oBBBo....',
        '..obBBo....',
        '...oPPo....',
        '...oppo....',
        '............',
        '............',
        '............',
    ], P)
    e_death2 = parse_grid([
        '............',
        '............',
        '............',
        '............',
        '............',
        '............',
        '............',
        '............',
        '.oHSSBBPPo.',
        '.ooooooooo.',
        '............',
    ], P)

    e_atk0 = parse_grid([
        '...oHHo....',
        '...oHHo....',
        '...oSSo....',
        '...oSEo....',
        '...oHHo....',
        '..oBBBo....',
        '..obBBoDd..',
        '...oBBo....',
        '...oPPo....',
        '...oPo.....',
        '...opo.....',
    ], P)
    e_atk1 = parse_grid([
        '...oHHo....',
        '...oHHo....',
        '...oSSo....',
        '...oSEo.W..',
        '...oHHoDd..',
        '..oBBBo....',
        '..obBBo....',
        '...oBBo....',
        '...oPPo....',
        '...oPo.....',
        '...opo.....',
    ], P)
    e_atk2 = parse_grid([
        '...oHHo..W.',
        '...oHHo.Dd.',
        '...oSSo....',
        '...oSEo....',
        '...oHHo....',
        '..oBBBo....',
        '..obBBo....',
        '...oBBo....',
        '...oPPo....',
        '...oPo.....',
        '...opo.....',
    ], P)
    e_atk3 = e_atk1

    # North
    n_idle0 = parse_grid([
        '...oHHHo...',
        '...ohhho...',
        '...ohhho...',
        '...ohhho...',
        '...ohhho...',
        '..obBbBbo..',
        '..oBBBBBo..',
        '...oBBBo...',
        '...oPPPo...',
        '...oP.Po...',
        '...op.po...',
    ], P)
    n_idle1 = shift(n_idle0, 0, 1)

    n_walk0 = n_idle0
    n_walk1 = parse_grid([
        '...oHHHo...',
        '...ohhho...',
        '...ohhho...',
        '...ohhho...',
        '...ohhho...',
        '..obBbBbo..',
        '..oBBBBBo..',
        '...oBBBo...',
        '...oPPPo...',
        '..oP..Po...',
        '..op..po...',
    ], P)
    n_walk2 = n_idle0
    n_walk3 = parse_grid([
        '...oHHHo...',
        '...ohhho...',
        '...ohhho...',
        '...ohhho...',
        '...ohhho...',
        '..obBbBbo..',
        '..oBBBBBo..',
        '...oBBBo...',
        '...oPPPo...',
        '...Po.oP...',
        '...po.op...',
    ], P)

    n_death0 = n_idle0
    n_death1 = s_death1
    n_death2 = s_death2

    n_atk0 = parse_grid([
        '...oHHHo...',
        '...ohhho...',
        '...ohhho...',
        '...ohhho...',
        '...ohhho...',
        '..obBbBbo..',
        '..oBBBBBoD.',
        '...oBBBo.d.',
        '...oPPPo...',
        '...oP.Po...',
        '...op.po...',
    ], P)
    n_atk1 = parse_grid([
        '...oHHHo...',
        '...ohhho...',
        '...ohhho.W.',
        '...ohhhoD..',
        '...ohhho...',
        '..obBbBbo..',
        '..oBBBBBo..',
        '...oBBBo...',
        '...oPPPo...',
        '...oP.Po...',
        '...op.po...',
    ], P)
    n_atk2 = parse_grid([
        '........W..',
        '...oHHHoDd.',
        '...ohhho...',
        '...ohhho...',
        '...ohhho...',
        '...ohhho...',
        '..obBbBbo..',
        '..oBBBBBo..',
        '...oBBBo...',
        '...oPPPo...',
        '...oP.Po...',
    ], P)
    n_atk3 = n_atk1

    ox, oy = 10, 10

    place_anim(img, [s_idle0, s_idle1], 0, ox, oy)
    place_anim(img, [e_idle0, e_idle1], 1, ox, oy)
    place_anim(img, [n_idle0, n_idle1], 2, ox, oy)
    place_anim(img, [s_walk0, s_walk1, s_walk2, s_walk3], 3, ox, oy)
    place_anim(img, [e_walk0, e_walk1, e_walk2, e_walk3], 4, ox, oy)
    place_anim(img, [n_walk0, n_walk1, n_walk2, n_walk3], 5, ox, oy)
    place_anim(img, [s_death0, s_death1, s_death2], 9, ox, oy)
    place_anim(img, [e_death0, e_death1, e_death2], 10, ox, oy)
    place_anim(img, [n_death0, n_death1, n_death2], 11, ox, oy)
    place_anim(img, [s_atk0, s_atk1, s_atk2, s_atk3], 12, ox, oy)
    place_anim(img, [e_atk0, e_atk1, e_atk2, e_atk3], 13, ox, oy)
    place_anim(img, [n_atk0, n_atk1, n_atk2, n_atk3], 14, ox, oy)

    save_sheet(img, 'dynamite_tosser')


# ═══════════════════════════════════════════════════════════════════════════
# ARMORED BANDIT — Bulky armored figure with helmet
# ═══════════════════════════════════════════════════════════════════════════
def generate_armored_bandit():
    img = make_sheet()

    P = {
        'o': (40, 40, 45, 255),         # dark outline
        'A': (150, 150, 160, 255),       # armor light
        'a': (110, 110, 120, 255),       # armor mid
        'M': (85, 85, 95, 255),          # armor dark
        'm': (65, 65, 75, 255),          # armor shadow
        'V': (30, 30, 35, 255),          # visor dark
        'R': (180, 60, 40, 255),         # red accent
        'P': (70, 60, 55, 255),          # pants
        'p': (50, 45, 40, 255),          # pants dark
        'H': (170, 170, 180, 255),       # helmet highlight
        'E': (200, 50, 30, 255),         # eye slit glow
    }

    s_idle0 = parse_grid([
        '...oAAAo...',
        '..oHAAAHo..',
        '..oaAAAao..',
        '..omVEVmo..',
        '..oMMMMo...',
        '.oaAAAAao..',
        '.oaAAAAao..',
        '..oAAAAo...',
        '..oMPPMo...',
        '...oP.Po...',
        '...op.po...',
        '...om.mo...',
    ], P)
    s_idle1 = shift(s_idle0, 0, 1)

    s_walk0 = s_idle0
    s_walk1 = parse_grid([
        '...oAAAo...',
        '..oHAAAHo..',
        '..oaAAAao..',
        '..omVEVmo..',
        '..oMMMMo...',
        '.oaAAAAao..',
        '.oaAAAAao..',
        '..oAAAAo...',
        '..oMPPMo...',
        '.oP...Po...',
        '.op...po...',
        '..m...m....',
    ], P)
    s_walk2 = s_idle0
    s_walk3 = parse_grid([
        '...oAAAo...',
        '..oHAAAHo..',
        '..oaAAAao..',
        '..omVEVmo..',
        '..oMMMMo...',
        '.oaAAAAao..',
        '.oaAAAAao..',
        '..oAAAAo...',
        '..oMPPMo...',
        '...P..oP...',
        '...p..op...',
        '...m...m...',
    ], P)

    s_death0 = s_idle0
    s_death1 = parse_grid([
        '............',
        '...oAAAo...',
        '..oaAAAao..',
        '..omVEVmo..',
        '.oaAAAAao..',
        '.oaAAAAao..',
        '..oMPPMo...',
        '..omppmo...',
        '............',
        '............',
        '............',
        '............',
    ], P)
    s_death2 = parse_grid([
        '............',
        '............',
        '............',
        '............',
        '............',
        '............',
        '............',
        '............',
        '............',
        '.oAAaMMPPo.',
        '.ommmmmmmm.',
        '............',
    ], P)

    s_atk0 = parse_grid([
        '...oAAAo...',
        '..oHAAAHo..',
        '..oaAAAao..',
        '..omVEVmo..',
        '..oMMMMo...',
        '.oaAAAAao..',
        'RoaAAAAaoR.',
        '..oAAAAo...',
        '..oMPPMo...',
        '...oP.Po...',
        '...op.po...',
        '...om.mo...',
    ], P)
    s_atk1 = parse_grid([
        '...oAAAo...',
        '..oHAAAHo..',
        '..oaAAAao..',
        '..omVEVmo..',
        '..oMMMMo...',
        '.oaAAAAao..',
        '.oaAAAAao..',
        '..oAAAAo...',
        '..oMPPMo...',
        '...oP.Po...',
        '...op.po...',
        '...om.mo...',
    ], P)
    s_atk2 = s_atk0
    s_atk3 = s_atk1

    # East
    e_idle0 = parse_grid([
        '...oAAo....',
        '..oHAAo....',
        '..oaAAo....',
        '..omVEo....',
        '..oMMo.....',
        '.oaAAAo....',
        '.oaAAAo....',
        '..oAAAo....',
        '..oMPMo....',
        '...oPo.....',
        '...opo.....',
        '...omo.....',
    ], P)
    e_idle1 = shift(e_idle0, 0, 1)

    e_walk0 = e_idle0
    e_walk1 = parse_grid([
        '...oAAo....',
        '..oHAAo....',
        '..oaAAo....',
        '..omVEo....',
        '..oMMo.....',
        '.oaAAAo....',
        '.oaAAAo....',
        '..oAAAo....',
        '..oMPMo....',
        '.oPoPo.....',
        '.opopoo....',
        '..m.m......',
    ], P)
    e_walk2 = e_idle0
    e_walk3 = parse_grid([
        '...oAAo....',
        '..oHAAo....',
        '..oaAAo....',
        '..omVEo....',
        '..oMMo.....',
        '.oaAAAo....',
        '.oaAAAo....',
        '..oAAAo....',
        '..oMPMo....',
        '...oPoPo...',
        '...opopoo..',
        '...m..m....',
    ], P)

    e_death0 = e_idle0
    e_death1 = parse_grid([
        '............',
        '..oHAAo....',
        '..oaAAo....',
        '..omVEo....',
        '.oaAAAo....',
        '.oaAAAo....',
        '..oMPMo....',
        '..ompmo....',
        '............',
        '............',
        '............',
        '............',
    ], P)
    e_death2 = parse_grid([
        '............',
        '............',
        '............',
        '............',
        '............',
        '............',
        '............',
        '............',
        '............',
        '.oAAaMMPo..',
        '.ommmmmmm..',
        '............',
    ], P)

    e_atk0 = parse_grid([
        '...oAAo....',
        '..oHAAo....',
        '..oaAAo....',
        '..omVEo....',
        '..oMMo.....',
        '.oaAAAo....',
        '.oaAAAoR...',
        '..oAAAo....',
        '..oMPMo....',
        '...oPo.....',
        '...opo.....',
        '...omo.....',
    ], P)
    e_atk1 = parse_grid([
        '...oAAo....',
        '..oHAAo....',
        '..oaAAo....',
        '..omVEo....',
        '..oMMo.....',
        '.oaAAAo....',
        '.oaAAAo.R..',
        '..oAAAo....',
        '..oMPMo....',
        '...oPo.....',
        '...opo.....',
        '...omo.....',
    ], P)
    e_atk2 = e_atk0
    e_atk3 = e_atk1

    # North
    n_idle0 = parse_grid([
        '...oAAAo...',
        '..oaAAAao..',
        '..omAAAmo..',
        '..omMMMmo..',
        '..oMMMMo...',
        '.omAAAAmo..',
        '.oaAAAAao..',
        '..oAAAAo...',
        '..oMPPMo...',
        '...oP.Po...',
        '...op.po...',
        '...om.mo...',
    ], P)
    n_idle1 = shift(n_idle0, 0, 1)

    n_walk0 = n_idle0
    n_walk1 = parse_grid([
        '...oAAAo...',
        '..oaAAAao..',
        '..omAAAmo..',
        '..omMMMmo..',
        '..oMMMMo...',
        '.omAAAAmo..',
        '.oaAAAAao..',
        '..oAAAAo...',
        '..oMPPMo...',
        '.oP...Po...',
        '.op...po...',
        '..m...m....',
    ], P)
    n_walk2 = n_idle0
    n_walk3 = parse_grid([
        '...oAAAo...',
        '..oaAAAao..',
        '..omAAAmo..',
        '..omMMMmo..',
        '..oMMMMo...',
        '.omAAAAmo..',
        '.oaAAAAao..',
        '..oAAAAo...',
        '..oMPPMo...',
        '...P..oP...',
        '...p..op...',
        '...m...m...',
    ], P)

    n_death0 = n_idle0
    n_death1 = s_death1
    n_death2 = s_death2

    n_atk0 = s_atk0
    n_atk1 = s_atk1
    n_atk2 = s_atk0
    n_atk3 = s_atk1

    ox, oy = 10, 9

    place_anim(img, [s_idle0, s_idle1], 0, ox, oy)
    place_anim(img, [e_idle0, e_idle1], 1, ox, oy)
    place_anim(img, [n_idle0, n_idle1], 2, ox, oy)
    place_anim(img, [s_walk0, s_walk1, s_walk2, s_walk3], 3, ox, oy)
    place_anim(img, [e_walk0, e_walk1, e_walk2, e_walk3], 4, ox, oy)
    place_anim(img, [n_walk0, n_walk1, n_walk2, n_walk3], 5, ox, oy)
    place_anim(img, [s_death0, s_death1, s_death2], 9, ox, oy)
    place_anim(img, [e_death0, e_death1, e_death2], 10, ox, oy)
    place_anim(img, [n_death0, n_death1, n_death2], 11, ox, oy)
    place_anim(img, [s_atk0, s_atk1, s_atk2, s_atk3], 12, ox, oy)
    place_anim(img, [e_atk0, e_atk1, e_atk2, e_atk3], 13, ox, oy)
    place_anim(img, [n_atk0, n_atk1, n_atk2, n_atk3], 14, ox, oy)

    save_sheet(img, 'armored_bandit')


# ═══════════════════════════════════════════════════════════════════════════
# HEALER SHAMAN — Robed figure with feathered headdress and staff
# ═══════════════════════════════════════════════════════════════════════════
def generate_healer_shaman():
    img = make_sheet()

    P = {
        'o': (20, 50, 45, 255),         # dark outline
        'F': (200, 80, 60, 255),         # feather red
        'f': (240, 180, 60, 255),        # feather gold
        'S': (160, 110, 70, 255),        # skin
        's': (130, 85, 55, 255),         # skin shadow
        'T': (60, 180, 150, 255),        # teal robe
        't': (40, 140, 115, 255),        # teal dark
        'R': (80, 210, 170, 255),        # robe light/accent
        'W': (180, 140, 80, 255),        # staff wood
        'w': (140, 105, 55, 255),        # staff dark
        'G': (120, 255, 200, 255),       # glow/magic
        'E': (30, 20, 10, 255),          # eyes
        'P': (90, 70, 50, 255),          # pants/sandals
    }

    s_idle0 = parse_grid([
        '....fFo....',
        '...ofFo....',
        '...oSSSo...',
        '...sEsEso..',
        '...oSSSo...',
        '..oTTTTTo..',
        '..otRTRto..',
        '..oTTTTTo..',
        '...oTTTo...',
        '...oTTTo...',
        '...oP.Po...',
        '...oo.oo...',
    ], P)
    s_idle1 = shift(s_idle0, 0, 1)

    s_walk0 = s_idle0
    s_walk1 = parse_grid([
        '....fFo....',
        '...ofFo....',
        '...oSSSo...',
        '...sEsEso..',
        '...oSSSo...',
        '..oTTTTTo..',
        '..otRTRto..',
        '..oTTTTTo..',
        '...oTTTo...',
        '...oTTTo...',
        '..oP..Po...',
        '..oo..oo...',
    ], P)
    s_walk2 = s_idle0
    s_walk3 = parse_grid([
        '....fFo....',
        '...ofFo....',
        '...oSSSo...',
        '...sEsEso..',
        '...oSSSo...',
        '..oTTTTTo..',
        '..otRTRto..',
        '..oTTTTTo..',
        '...oTTTo...',
        '...oTTTo...',
        '...Po.oP...',
        '...oo.oo...',
    ], P)

    s_death0 = s_idle0
    s_death1 = parse_grid([
        '............',
        '....fFo....',
        '...ofFo....',
        '...oSSSo...',
        '..oTTTTTo..',
        '..otRTRto..',
        '..oTTTTTo..',
        '...oTTTo...',
        '...opppo...',
        '............',
        '............',
        '............',
    ], P)
    s_death2 = parse_grid([
        '............',
        '............',
        '............',
        '............',
        '............',
        '............',
        '............',
        '............',
        '............',
        '.fFSTTTTPo.',
        '.ooooooooo.',
        '............',
    ], P)

    # Attack: staff raised with magic glow
    s_atk0 = parse_grid([
        '....fFo....',
        '...ofFo....',
        '...oSSSo...',
        '...sEsEso..',
        '...oSSSo...',
        '.WoTTTTTo..',
        '.WotRTRto..',
        '.WoTTTTTo..',
        '...oTTTo...',
        '...oTTTo...',
        '...oP.Po...',
        '...oo.oo...',
    ], P)
    s_atk1 = parse_grid([
        '.G..........',
        '.W..fFo....',
        '.W.ofFo....',
        '...oSSSo...',
        '...sEsEso..',
        '...oSSSo...',
        '..oTTTTTo..',
        '..otRTRto..',
        '..oTTTTTo..',
        '...oTTTo...',
        '...oP.Po...',
        '...oo.oo...',
    ], P)
    s_atk2 = parse_grid([
        'GGG........',
        '.WG.fFo....',
        '.W.ofFo....',
        '...oSSSo...',
        '...sEsEso..',
        '...oSSSo...',
        '..oTTTTTo..',
        '..otRTRto..',
        '..oTTTTTo..',
        '...oTTTo...',
        '...oP.Po...',
        '...oo.oo...',
    ], P)
    s_atk3 = s_atk1

    # East
    e_idle0 = parse_grid([
        '...fFo.....',
        '...oFo.....',
        '...oSSo....',
        '...oSEo....',
        '...oSSo....',
        '..oTTTo....',
        '..otTRo....',
        '..oTTTo....',
        '...oTTo....',
        '...oTTo....',
        '...oPo.....',
        '...ooo.....',
    ], P)
    e_idle1 = shift(e_idle0, 0, 1)

    e_walk0 = e_idle0
    e_walk1 = parse_grid([
        '...fFo.....',
        '...oFo.....',
        '...oSSo....',
        '...oSEo....',
        '...oSSo....',
        '..oTTTo....',
        '..otTRo....',
        '..oTTTo....',
        '...oTTo....',
        '...oTTo....',
        '..oPoPo....',
        '..ooooo....',
    ], P)
    e_walk2 = e_idle0
    e_walk3 = parse_grid([
        '...fFo.....',
        '...oFo.....',
        '...oSSo....',
        '...oSEo....',
        '...oSSo....',
        '..oTTTo....',
        '..otTRo....',
        '..oTTTo....',
        '...oTTo....',
        '...oTTo....',
        '...oPoP....',
        '...ooooo...',
    ], P)

    e_death0 = e_idle0
    e_death1 = parse_grid([
        '............',
        '...fFo.....',
        '...oFo.....',
        '...oSSo....',
        '..oTTTo....',
        '..otTRo....',
        '..oTTTo....',
        '...oTTo....',
        '...oppo....',
        '............',
        '............',
        '............',
    ], P)
    e_death2 = parse_grid([
        '............',
        '............',
        '............',
        '............',
        '............',
        '............',
        '............',
        '............',
        '............',
        '.fSSTTTPo..',
        '.ooooooo...',
        '............',
    ], P)

    e_atk0 = parse_grid([
        '...fFo.....',
        '...oFo.....',
        '...oSSo....',
        '...oSEo....',
        '...oSSo....',
        '..oTTToW...',
        '..otTRoW...',
        '..oTTToW...',
        '...oTTo....',
        '...oTTo....',
        '...oPo.....',
        '...ooo.....',
    ], P)
    e_atk1 = parse_grid([
        '...fFo.....',
        '...oFo.....',
        '...oSSo....',
        '...oSEo....',
        '...oSSo.G..',
        '..oTTTo.W..',
        '..otTRo.W..',
        '..oTTTo....',
        '...oTTo....',
        '...oTTo....',
        '...oPo.....',
        '...ooo.....',
    ], P)
    e_atk2 = parse_grid([
        '...fFo.....',
        '...oFo..GG.',
        '...oSSo.WG.',
        '...oSEo.W..',
        '...oSSo....',
        '..oTTTo....',
        '..otTRo....',
        '..oTTTo....',
        '...oTTo....',
        '...oTTo....',
        '...oPo.....',
        '...ooo.....',
    ], P)
    e_atk3 = e_atk1

    # North
    n_idle0 = parse_grid([
        '....fFo....',
        '...ofFo....',
        '...ossso...',
        '...ossso...',
        '...ossso...',
        '..oTTTTTo..',
        '..otTtTto..',
        '..oTTTTTo..',
        '...oTTTo...',
        '...oTTTo...',
        '...oP.Po...',
        '...oo.oo...',
    ], P)
    n_idle1 = shift(n_idle0, 0, 1)

    n_walk0 = n_idle0
    n_walk1 = parse_grid([
        '....fFo....',
        '...ofFo....',
        '...ossso...',
        '...ossso...',
        '...ossso...',
        '..oTTTTTo..',
        '..otTtTto..',
        '..oTTTTTo..',
        '...oTTTo...',
        '...oTTTo...',
        '..oP..Po...',
        '..oo..oo...',
    ], P)
    n_walk2 = n_idle0
    n_walk3 = parse_grid([
        '....fFo....',
        '...ofFo....',
        '...ossso...',
        '...ossso...',
        '...ossso...',
        '..oTTTTTo..',
        '..otTtTto..',
        '..oTTTTTo..',
        '...oTTTo...',
        '...oTTTo...',
        '...Po.oP...',
        '...oo.oo...',
    ], P)

    n_death0 = n_idle0
    n_death1 = s_death1
    n_death2 = s_death2

    n_atk0 = parse_grid([
        '....fFo....',
        '...ofFo....',
        '...ossso...',
        '...ossso...',
        '...ossso...',
        '.WoTTTTTo..',
        '.WotTtTto..',
        '.WoTTTTTo..',
        '...oTTTo...',
        '...oTTTo...',
        '...oP.Po...',
        '...oo.oo...',
    ], P)
    n_atk1 = parse_grid([
        '.G..........',
        '.W..fFo....',
        '.W.ofFo....',
        '...ossso...',
        '...ossso...',
        '...ossso...',
        '..oTTTTTo..',
        '..otTtTto..',
        '..oTTTTTo..',
        '...oTTTo...',
        '...oP.Po...',
        '...oo.oo...',
    ], P)
    n_atk2 = parse_grid([
        'GGG........',
        '.WG.fFo....',
        '.W.ofFo....',
        '...ossso...',
        '...ossso...',
        '...ossso...',
        '..oTTTTTo..',
        '..otTtTto..',
        '..oTTTTTo..',
        '...oTTTo...',
        '...oP.Po...',
        '...oo.oo...',
    ], P)
    n_atk3 = n_atk1

    ox, oy = 10, 10

    place_anim(img, [s_idle0, s_idle1], 0, ox, oy)
    place_anim(img, [e_idle0, e_idle1], 1, ox, oy)
    place_anim(img, [n_idle0, n_idle1], 2, ox, oy)
    place_anim(img, [s_walk0, s_walk1, s_walk2, s_walk3], 3, ox, oy)
    place_anim(img, [e_walk0, e_walk1, e_walk2, e_walk3], 4, ox, oy)
    place_anim(img, [n_walk0, n_walk1, n_walk2, n_walk3], 5, ox, oy)
    place_anim(img, [s_death0, s_death1, s_death2], 9, ox, oy)
    place_anim(img, [e_death0, e_death1, e_death2], 10, ox, oy)
    place_anim(img, [n_death0, n_death1, n_death2], 11, ox, oy)
    place_anim(img, [s_atk0, s_atk1, s_atk2, s_atk3], 12, ox, oy)
    place_anim(img, [e_atk0, e_atk1, e_atk2, e_atk3], 13, ox, oy)
    place_anim(img, [n_atk0, n_atk1, n_atk2, n_atk3], 14, ox, oy)

    save_sheet(img, 'healer_shaman')


# ═══════════════════════════════════════════════════════════════════════════
# RATTLESNAKE — Serpentine creature, coiled/slithering
# ═══════════════════════════════════════════════════════════════════════════
def generate_rattlesnake():
    img = make_sheet()

    P = {
        'o': (40, 45, 20, 255),         # dark outline
        'G': (130, 150, 70, 255),        # green/olive body
        'g': (100, 115, 50, 255),        # body dark
        'B': (180, 170, 100, 255),       # belly light
        'b': (150, 140, 80, 255),        # belly
        'E': (200, 50, 30, 255),         # red eyes
        'T': (160, 140, 60, 255),        # tail rattle
        't': (130, 110, 45, 255),        # rattle dark
        'F': (220, 70, 50, 255),         # fangs/tongue
        'H': (150, 165, 80, 255),        # head highlight
        'D': (80, 90, 40, 255),          # diamond pattern
    }

    # Rattlesnake south: coiled, head up facing viewer
    s_idle0 = parse_grid([
        '............',
        '...oHHo....',
        '..oHEEHo...',
        '...oFFo....',
        '..oGGGGo...',
        '.oGDGDGGo..',
        '.oBBBBBBo..',
        '.oGGDGDGo..',
        '..oGGGGo...',
        '...oTto....',
        '...otTo....',
        '............',
    ], P)
    s_idle1 = parse_grid([
        '............',
        '...oHHo....',
        '..oHEEHo...',
        '...oFFo....',
        '..oGGGGo...',
        '.oGDGDGGo..',
        '.oBBBBBBo..',
        '.oGGDGDGo..',
        '..oGGGGo...',
        '...otTo....',
        '...oTto....',
        '............',
    ], P)

    s_walk0 = s_idle0
    s_walk1 = parse_grid([
        '............',
        '...oHHo....',
        '..oHEEHo...',
        '...oFFo....',
        '.oGGGGo....',
        'oGDGDGGo...',
        'oBBBBBBo...',
        '.oGGDGDo...',
        '..oGGGGo...',
        '...oTto....',
        '............',
        '............',
    ], P)
    s_walk2 = s_idle0
    s_walk3 = parse_grid([
        '............',
        '...oHHo....',
        '..oHEEHo...',
        '...oFFo....',
        '...oGGGGo..',
        '...oGDGDGo.',
        '...oBBBBBo.',
        '...oGDGGo..',
        '..oGGGGo...',
        '...oTto....',
        '............',
        '............',
    ], P)

    s_death0 = s_idle0
    s_death1 = parse_grid([
        '............',
        '............',
        '...oHHo....',
        '..oGGGGo...',
        '.oGDGDGGo..',
        '.oBBBBBBo..',
        '.oGGDGDGo..',
        '..oGGGGo...',
        '...oTto....',
        '............',
        '............',
        '............',
    ], P)
    s_death2 = parse_grid([
        '............',
        '............',
        '............',
        '............',
        '............',
        '............',
        '............',
        '............',
        '............',
        '.oGGBBGGTo.',
        '.ooooooooo.',
        '............',
    ], P)

    # Strike attack (lunge forward with fangs)
    s_atk0 = s_idle0
    s_atk1 = parse_grid([
        '...oHHo....',
        '..oHEEHo...',
        '..oGFFGo...',
        '..oGGGGo...',
        '.oGDGDGGo..',
        '.oBBBBBBo..',
        '.oGGDGDGo..',
        '..oGGGGo...',
        '...oTto....',
        '............',
        '............',
        '............',
    ], P)
    s_atk2 = parse_grid([
        '..oHHo.....',
        '.oHEEHo....',
        '.oGFFGo....',
        '.oGGGGo....',
        '.oGDGDGo...',
        '.oBBBBBo...',
        '.oGGDGDo...',
        '..oGGGGo...',
        '...oTto....',
        '............',
        '............',
        '............',
    ], P)
    s_atk3 = s_atk1

    # East: stretched out, head right
    e_idle0 = parse_grid([
        '............',
        '............',
        '............',
        '......oHHo..',
        '.....oHEGo..',
        '....oGGGo...',
        '..oGDGGo....',
        '.oGBBGo.....',
        '.oGDGo......',
        '..oGo.......',
        '..oTto......',
        '............',
    ], P)
    e_idle1 = parse_grid([
        '............',
        '............',
        '............',
        '......oHHo..',
        '.....oHEGo..',
        '....oGGGo...',
        '...oGDGo....',
        '..oGBBGo....',
        '..oGDGo.....',
        '...oGo......',
        '...oTto.....',
        '............',
    ], P)

    e_walk0 = e_idle0
    e_walk1 = parse_grid([
        '............',
        '............',
        '............',
        '.......oHHo.',
        '......oHEGo.',
        '.....oGGGo..',
        '...oGDGGo...',
        '..oGBBGo....',
        '.oGDGo......',
        '.oGo........',
        '.oTto.......',
        '............',
    ], P)
    e_walk2 = e_idle0
    e_walk3 = parse_grid([
        '............',
        '............',
        '............',
        '.....oHHo...',
        '....oHEGo...',
        '...oGGGo....',
        '..oGDGGo....',
        '.oGBBGo.....',
        '.oGDGo......',
        '..oGo.......',
        '...oTto.....',
        '............',
    ], P)

    e_death0 = e_idle0
    e_death1 = parse_grid([
        '............',
        '............',
        '............',
        '............',
        '....oHGGo...',
        '...oGGGGo...',
        '..oGBBGo....',
        '.oGDGo......',
        '..oGo.......',
        '..oTto......',
        '............',
        '............',
    ], P)
    e_death2 = parse_grid([
        '............',
        '............',
        '............',
        '............',
        '............',
        '............',
        '............',
        '............',
        '............',
        '.oGGBBGGTo.',
        '.ooooooooo.',
        '............',
    ], P)

    # East attack: strike forward
    e_atk0 = e_idle0
    e_atk1 = parse_grid([
        '............',
        '............',
        '............',
        '.......oHHo.',
        '......oHEFo.',
        '.....oGGGo..',
        '...oGDGGo...',
        '..oGBBGo....',
        '.oGDGo......',
        '.oGo........',
        '.oTto.......',
        '............',
    ], P)
    e_atk2 = parse_grid([
        '............',
        '............',
        '........oHHo',
        '.......oHEFo',
        '......oGGFo.',
        '....oGGGo...',
        '..oGDGGo....',
        '.oGBBGo.....',
        '.oGDGo......',
        '..oGo.......',
        '..oTto......',
        '............',
    ], P)
    e_atk3 = e_atk1

    # North: coiled, head facing away
    n_idle0 = parse_grid([
        '............',
        '...ogggo...',
        '..oggggo...',
        '...ogggo...',
        '..oGGGGo...',
        '.oGDGDGGo..',
        '.oBBBBBBo..',
        '.oGGDGDGo..',
        '..oGGGGo...',
        '...oTto....',
        '...otTo....',
        '............',
    ], P)
    n_idle1 = parse_grid([
        '............',
        '...ogggo...',
        '..oggggo...',
        '...ogggo...',
        '..oGGGGo...',
        '.oGDGDGGo..',
        '.oBBBBBBo..',
        '.oGGDGDGo..',
        '..oGGGGo...',
        '...otTo....',
        '...oTto....',
        '............',
    ], P)

    n_walk0 = n_idle0
    n_walk1 = parse_grid([
        '............',
        '...ogggo...',
        '..oggggo...',
        '...ogggo...',
        '.oGGGGo....',
        'oGDGDGGo...',
        'oBBBBBBo...',
        '.oGGDGDo...',
        '..oGGGGo...',
        '...oTto....',
        '............',
        '............',
    ], P)
    n_walk2 = n_idle0
    n_walk3 = parse_grid([
        '............',
        '...ogggo...',
        '..oggggo...',
        '...ogggo...',
        '...oGGGGo..',
        '...oGDGDGo.',
        '...oBBBBBo.',
        '...oGDGGo..',
        '..oGGGGo...',
        '...oTto....',
        '............',
        '............',
    ], P)

    n_death0 = n_idle0
    n_death1 = s_death1
    n_death2 = s_death2

    n_atk0 = n_idle0
    n_atk1 = parse_grid([
        '...ogggo...',
        '..oggggo...',
        '..oGGGGo...',
        '.oGDGDGGo..',
        '.oBBBBBBo..',
        '.oGGDGDGo..',
        '..oGGGGo...',
        '...oTto....',
        '............',
        '............',
        '............',
        '............',
    ], P)
    n_atk2 = parse_grid([
        '..ogggo.....',
        '.oggggo.....',
        '.oGGGGo.....',
        '.oGDGDGo....',
        '.oBBBBBo....',
        '.oGGDGDo....',
        '..oGGGGo....',
        '...oTto.....',
        '............',
        '............',
        '............',
        '............',
    ], P)
    n_atk3 = n_atk1

    ox, oy = 10, 10

    place_anim(img, [s_idle0, s_idle1], 0, ox, oy)
    place_anim(img, [e_idle0, e_idle1], 1, ox, oy)
    place_anim(img, [n_idle0, n_idle1], 2, ox, oy)
    place_anim(img, [s_walk0, s_walk1, s_walk2, s_walk3], 3, ox, oy)
    place_anim(img, [e_walk0, e_walk1, e_walk2, e_walk3], 4, ox, oy)
    place_anim(img, [n_walk0, n_walk1, n_walk2, n_walk3], 5, ox, oy)
    place_anim(img, [s_death0, s_death1, s_death2], 9, ox, oy)
    place_anim(img, [e_death0, e_death1, e_death2], 10, ox, oy)
    place_anim(img, [n_death0, n_death1, n_death2], 11, ox, oy)
    place_anim(img, [s_atk0, s_atk1, s_atk2, s_atk3], 12, ox, oy)
    place_anim(img, [e_atk0, e_atk1, e_atk2, e_atk3], 13, ox, oy)
    place_anim(img, [n_atk0, n_atk1, n_atk2, n_atk3], 14, ox, oy)

    save_sheet(img, 'rattlesnake')


# ═══════════════════════════════════════════════════════════════════════════
# VULTURE — Bird creature with wings, beak
# ═══════════════════════════════════════════════════════════════════════════
def generate_vulture():
    img = make_sheet()

    P = {
        'o': (30, 20, 15, 255),         # dark outline
        'B': (100, 80, 60, 255),         # brown body
        'b': (75, 60, 45, 255),          # body dark
        'W': (130, 110, 85, 255),        # wing light
        'w': (90, 75, 55, 255),          # wing dark
        'H': (170, 160, 150, 255),       # grey head
        'h': (130, 120, 110, 255),       # head dark
        'R': (200, 60, 40, 255),         # red wattle
        'K': (220, 180, 60, 255),        # beak yellow
        'k': (180, 140, 40, 255),        # beak dark
        'E': (30, 20, 10, 255),          # eye
        'T': (60, 50, 40, 255),          # talons dark
        'F': (110, 90, 70, 255),         # feather tips
    }

    # South: bird perched, wings tucked, head forward
    s_idle0 = parse_grid([
        '...oHHo....',
        '..oHEHRo...',
        '...oKKo....',
        '..oWBBWo...',
        '.oWBBBBWo..',
        '.owBBBBwo..',
        '..oBBBBo...',
        '..obFFbo...',
        '...oFFo....',
        '...oT.To...',
        '...oT.To...',
        '............',
    ], P)
    s_idle1 = shift(s_idle0, 0, 1)

    s_walk0 = s_idle0
    s_walk1 = parse_grid([
        '...oHHo....',
        '..oHEHRo...',
        '...oKKo....',
        '.oWWBBWWo..',
        'oWWBBBBWWo.',
        '.owBBBBwo..',
        '..oBBBBo...',
        '..obFFbo...',
        '...oFFo....',
        '...oT.To...',
        '............',
        '............',
    ], P)
    s_walk2 = s_idle0
    s_walk3 = parse_grid([
        '...oHHo....',
        '..oHEHRo...',
        '...oKKo....',
        '..oWBBWo...',
        '.oWBBBBWo..',
        '.oWBBBBWo..',
        '..oBBBBo...',
        '..obFFbo...',
        '...oFFo....',
        '...oT.To...',
        '............',
        '............',
    ], P)

    s_death0 = s_idle0
    s_death1 = parse_grid([
        '............',
        '...oHHo....',
        '..oHEHRo...',
        '..oWBBWo...',
        '.oWBBBBWo..',
        '.owBBBBwo..',
        '..oBBBBo...',
        '...obbo....',
        '............',
        '............',
        '............',
        '............',
    ], P)
    s_death2 = parse_grid([
        '............',
        '............',
        '............',
        '............',
        '............',
        '............',
        '............',
        '............',
        '............',
        '.oHWBBBWFo.',
        '.ooooooooo.',
        '............',
    ], P)

    # Dive attack
    s_atk0 = parse_grid([
        '...oHHo....',
        '..oHEHRo...',
        '...oKKo....',
        'oWWWBBWWWo.',
        'oWWBBBBWWo.',
        '.owBBBBwo..',
        '..oBBBBo...',
        '..obFFbo...',
        '...oFFo....',
        '...oT.To...',
        '............',
        '............',
    ], P)
    s_atk1 = parse_grid([
        '............',
        '...oHHo....',
        '..oHEHRo...',
        '...oKKo....',
        'oWWWBBWWWo.',
        '.oWBBBBWo..',
        '..oBBBBo...',
        '..obFFbo...',
        '...oTTo....',
        '............',
        '............',
        '............',
    ], P)
    s_atk2 = parse_grid([
        '............',
        '............',
        '...oHHo....',
        '..oHEHRo...',
        '..okKKko...',
        'oWWBBBBWWo.',
        '.oWBBBBWo..',
        '..oBBBBo...',
        '..obFFbo...',
        '...oTTo....',
        '............',
        '............',
    ], P)
    s_atk3 = s_atk1

    # East: side view
    e_idle0 = parse_grid([
        '............',
        '...oHHo....',
        '..oHEhRo...',
        '...okKo....',
        '...oBBo....',
        '..oBBBo....',
        '..owBBo....',
        '..oWBBo....',
        '...obFo....',
        '...oTo.....',
        '...oTo.....',
        '............',
    ], P)
    e_idle1 = shift(e_idle0, 0, 1)

    e_walk0 = e_idle0
    e_walk1 = parse_grid([
        '............',
        '...oHHo....',
        '..oHEhRo...',
        '...okKo....',
        '..oWBBo....',
        '.oWBBBo....',
        '.owBBBo....',
        '..oWBBo....',
        '...obFo....',
        '...oTo.....',
        '............',
        '............',
    ], P)
    e_walk2 = e_idle0
    e_walk3 = parse_grid([
        '............',
        '...oHHo....',
        '..oHEhRo...',
        '...okKo....',
        '...oBBWo...',
        '..oBBBWo...',
        '..owBBBo...',
        '..oWBBo....',
        '...obFo....',
        '...oTo.....',
        '............',
        '............',
    ], P)

    e_death0 = e_idle0
    e_death1 = parse_grid([
        '............',
        '............',
        '...oHHo....',
        '..oHEhRo...',
        '...oBBo....',
        '..oBBBo....',
        '..owBBo....',
        '...obFo....',
        '............',
        '............',
        '............',
        '............',
    ], P)
    e_death2 = parse_grid([
        '............',
        '............',
        '............',
        '............',
        '............',
        '............',
        '............',
        '............',
        '............',
        '.oHWBBBFo..',
        '.oooooooo..',
        '............',
    ], P)

    e_atk0 = parse_grid([
        '............',
        '...oHHo....',
        '..oHEhRo...',
        '...okKKo...',
        '..oWBBo....',
        '.oWBBBo....',
        '.owBBBo....',
        '..oWBBo....',
        '...obFo....',
        '...oTo.....',
        '............',
        '............',
    ], P)
    e_atk1 = parse_grid([
        '............',
        '............',
        '...oHHo....',
        '..oHEhRo...',
        '...okKKo...',
        '.oWWBBo....',
        'oWWBBBo....',
        '.owBBBo....',
        '..oWBBo....',
        '...oTTo....',
        '............',
        '............',
    ], P)
    e_atk2 = parse_grid([
        '............',
        '............',
        '............',
        '...oHHo....',
        '..oHEhRo...',
        '..okKKko...',
        'oWWBBBBo...',
        '.oWBBBo....',
        '..oBBBo....',
        '...oTTo....',
        '............',
        '............',
    ], P)
    e_atk3 = e_atk1

    # North: back view
    n_idle0 = parse_grid([
        '...ohho....',
        '..ohhho....',
        '...ohho....',
        '..owBBwo...',
        '.oWBBBBWo..',
        '.owBBBBwo..',
        '..oBBBBo...',
        '..obFFbo...',
        '...oFFo....',
        '...oT.To...',
        '...oT.To...',
        '............',
    ], P)
    n_idle1 = shift(n_idle0, 0, 1)

    n_walk0 = n_idle0
    n_walk1 = parse_grid([
        '...ohho....',
        '..ohhho....',
        '...ohho....',
        '.oWWBBWWo..',
        'oWWBBBBWWo.',
        '.owBBBBwo..',
        '..oBBBBo...',
        '..obFFbo...',
        '...oFFo....',
        '...oT.To...',
        '............',
        '............',
    ], P)
    n_walk2 = n_idle0
    n_walk3 = parse_grid([
        '...ohho....',
        '..ohhho....',
        '...ohho....',
        '..owBBwo...',
        '.oWBBBBWo..',
        '.oWBBBBWo..',
        '..oBBBBo...',
        '..obFFbo...',
        '...oFFo....',
        '...oT.To...',
        '............',
        '............',
    ], P)

    n_death0 = n_idle0
    n_death1 = s_death1
    n_death2 = s_death2

    n_atk0 = parse_grid([
        '...ohho....',
        '..ohhho....',
        '...ohho....',
        'oWWWBBWWWo.',
        'oWWBBBBWWo.',
        '.owBBBBwo..',
        '..oBBBBo...',
        '..obFFbo...',
        '...oFFo....',
        '...oT.To...',
        '............',
        '............',
    ], P)
    n_atk1 = parse_grid([
        '............',
        '...ohho....',
        '..ohhho....',
        '...ohho....',
        'oWWWBBWWWo.',
        '.oWBBBBWo..',
        '..oBBBBo...',
        '..obFFbo...',
        '...oTTo....',
        '............',
        '............',
        '............',
    ], P)
    n_atk2 = parse_grid([
        '............',
        '............',
        '...ohho....',
        '..ohhho....',
        '...ohho....',
        'oWWBBBBWWo.',
        '.oWBBBBWo..',
        '..oBBBBo...',
        '..obFFbo...',
        '...oTTo....',
        '............',
        '............',
    ], P)
    n_atk3 = n_atk1

    ox, oy = 10, 10

    place_anim(img, [s_idle0, s_idle1], 0, ox, oy)
    place_anim(img, [e_idle0, e_idle1], 1, ox, oy)
    place_anim(img, [n_idle0, n_idle1], 2, ox, oy)
    place_anim(img, [s_walk0, s_walk1, s_walk2, s_walk3], 3, ox, oy)
    place_anim(img, [e_walk0, e_walk1, e_walk2, e_walk3], 4, ox, oy)
    place_anim(img, [n_walk0, n_walk1, n_walk2, n_walk3], 5, ox, oy)
    place_anim(img, [s_death0, s_death1, s_death2], 9, ox, oy)
    place_anim(img, [e_death0, e_death1, e_death2], 10, ox, oy)
    place_anim(img, [n_death0, n_death1, n_death2], 11, ox, oy)
    place_anim(img, [s_atk0, s_atk1, s_atk2, s_atk3], 12, ox, oy)
    place_anim(img, [e_atk0, e_atk1, e_atk2, e_atk3], 13, ox, oy)
    place_anim(img, [n_atk0, n_atk1, n_atk2, n_atk3], 14, ox, oy)

    save_sheet(img, 'vulture')


# ═══════════════════════════════════════════════════════════════════════════
# Main
# ═══════════════════════════════════════════════════════════════════════════
if __name__ == '__main__':
    os.makedirs(SPRITE_DIR, exist_ok=True)
    print('Generating Sprint 18 enemy sprites...')
    generate_lasso_bandit()
    generate_dynamite_tosser()
    generate_armored_bandit()
    generate_healer_shaman()
    generate_rattlesnake()
    generate_vulture()
    print('Done!')
