#!/usr/bin/env python3
"""Slice the approved generated atlas, retaining alpha and full irregular edges."""
from pathlib import Path
import re
from PIL import Image, ImageOps
ROOT=Path(__file__).resolve().parents[1]
source=Image.open(ROOT/'artwork-source/card-backs/approved-atlas.png').convert('RGBA')
ids=re.findall(r"\{id:'([^']+)'",(ROOT/'card-backs.js').read_text())
assert len(ids)==16 and source.size==(1024,1536)
# The generator's row gutters differ from a mathematical 4x4 grid.
rows=[(14,390),(394,763),(765,1127),(1130,1510)]
output=ROOT/'assets/backs';output.mkdir(exist_ok=True)
for i,name in enumerate(ids):
    top,bottom=rows[i//4];left=(i%4)*256
    cell=source.crop((left,top,left+256,bottom))
    box=cell.getchannel('A').point(lambda a:255 if a>8 else 0).getbbox()
    assert box,name
    art=ImageOps.contain(cell.crop(box),(276,420),Image.Resampling.LANCZOS)
    canvas=Image.new('RGBA',(288,432),(0,0,0,0))
    canvas.alpha_composite(art,((288-art.width)//2,(432-art.height)//2))
    canvas.save(output/(name+'.webp'),quality=88,method=6,exact=True)
print('Prepared',len(ids),'card backs;',sum(p.stat().st_size for p in output.glob('*.webp')),'bytes')
