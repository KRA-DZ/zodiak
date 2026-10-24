#!/usr/bin/env python3
"""Render real recordings into clean gameplay videos, captioned ads and a screenshot ZIP."""
from pathlib import Path
import json, os, subprocess, textwrap, zipfile
ROOT=Path(__file__).resolve().parents[1]
WORK=Path(os.environ.get('PROMO_WORKDIR','/tmp/zodiac-trailer'))
OUT=ROOT/'promotion'; OUT.mkdir(exist_ok=True)
FONT='/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
FADE=.2

def run(args):
    subprocess.run(args,check=True)

def probe(file):
    return json.loads(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration,size:stream=codec_name,width,height,r_frame_rate,pix_fmt','-of','json',str(file)]))

def ff(args):
    run(['ffmpeg','-hide_banner','-loglevel','error','-y']+args)

manifest=[]
for orientation in ['horizontal','vertical']:
    data=json.loads((WORK/(orientation+'.json')).read_text())
    assert not data['errors'], data['errors']
    width,height=(1280,720) if orientation=='horizontal' else (720,1280)
    actual=float(probe(data['file'])['format']['duration'])
    # The recorder repeats its last frame while closing. Total duration is not a start-time offset.
    # An optional offset can be calibrated by checking scene cuts in the raw recording.
    shift=float(data.get('videoOffset',0))
    assert abs(shift)<1, ('Recording clock offset',shift)
    parts=[]; timeline=[]; end=0
    for n,clip in enumerate(data['clips']):
        if n==0:
            clip['caption']='Три режима — твоё предсказание'
            clip['duration']=min(clip['duration'],5.4)  # Keep the opening cascade; omit its idle tail.
        part=WORK/(orientation+'-'+str(n)+'.mp4');parts.append(part)
        ff(['-ss',str(max(0,clip['start']+shift)),'-threads','1','-i',data['file'],'-t',str(clip['duration']),'-vf',f'scale={width}:{height}:flags=lanczos,fps=30,setsar=1,format=yuv420p','-an','-c:v','libx264','-threads','2','-preset','fast','-crf','18',str(part)])
        start=end-FADE if n else 0;end=start+clip['duration']
        timeline.append({'scene':clip['name'],'start':round(start,3),'duration':clip['duration'],'caption':clip['caption']})
    args=[];filters=[]
    for n,part in enumerate(parts):
        args+=['-threads','1','-i',str(part)]
        filters.append(f'[{n}:v]settb=AVTB,setsar=1[v{n}]')
    previous='v0'
    for n in range(1,len(parts)):
        name='mix'+str(n)
        filters.append(f'[{previous}][v{n}]xfade=transition=fade:duration={FADE}:offset={timeline[n]["start"]}[{name}]')
        previous=name
    clean=OUT/f'gameplay-{orientation}-{width}x{height}.mp4'
    ff(args+['-filter_complex_threads','1','-filter_complex',';'.join(filters),'-map',f'[{previous}]','-an','-c:v','libx264','-threads','2','-preset','fast','-crf','20','-pix_fmt','yuv420p','-movflags','+faststart',str(clean)])
    # Captions occupy their own band: the full game image remains visible below them.
    if orientation=='horizontal':
        graph='scale=1184:666:flags=lanczos,pad=1280:720:48:54:color=0x10142c,drawbox=x=48:y=48:w=1184:h=2:color=0xc8a95f:t=fill'
        fontsize,y=26,11
    else:
        graph='scale=648:1152:flags=lanczos,pad=720:1280:36:128:color=0x10142c,drawbox=x=36:y=112:w=648:h=2:color=0xc8a95f:t=fill'
        fontsize,y=26,24
    for n,scene in enumerate(timeline):
        caption=scene['caption'] if orientation=='horizontal' else textwrap.fill(scene['caption'],width=29,break_long_words=False)
        text=WORK/f'caption-{orientation}-{n}.txt';text.write_text(caption)
        finish=timeline[n+1]['start'] if n+1<len(timeline) else end+.2
        graph+=f",drawtext=fontfile={FONT}:textfile={text}:fontcolor=0xffe7b2:fontsize={fontsize}:line_spacing=6:x=(w-text_w)/2:y={y}:enable='gte(t,{scene['start']})*lt(t,{finish})'"
    advert=OUT/f'advert-{orientation}-{width}x{height}.mp4'
    ff(['-threads','1','-i',str(clean),'-vf',graph,'-an','-c:v','libx264','-threads','2','-preset','fast','-crf','20','-pix_fmt','yuv420p','-movflags','+faststart',str(advert)])
    details=probe(advert)
    assert details['streams'][0]['width']==width and details['streams'][0]['height']==height
    assert 20<float(details['format']['duration'])<30
    manifest.append({'orientation':orientation,'gameplay':clean.name,'advert':advert.name,'duration':details['format']['duration'],'scenes':timeline})
    print(orientation,'ready',details['format'],flush=True)
shots=sorted(WORK.glob('0[1-6]-*.png'))
assert len(shots)==6
with zipfile.ZipFile(OUT/'screenshots-desktop.zip','w',zipfile.ZIP_DEFLATED) as archive:
    for file in shots:archive.write(file,file.name)
(OUT/'trailer-storyboard.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
print('Six desktop screenshots packaged',flush=True)
