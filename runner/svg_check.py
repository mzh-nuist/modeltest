"""Static SVG artifact check only. Does not award visual quality or run scripts."""
import xml.etree.ElementTree as ET


def check_svg(text):
    if not isinstance(text,str) or len(text)>1_000_000 or '<!DOCTYPE' in text.upper() or '<!ENTITY' in text.upper():
        return {'valid':False,'reason':'Unsupported XML declarations or size'}
    try: root=ET.fromstring(text)
    except ET.ParseError: return {'valid':False,'reason':'Invalid XML'}
    allowed={'svg','g','path','circle','ellipse','rect','line','polyline','polygon','text','tspan','defs','linearGradient','radialGradient','stop','clipPath','title','desc'}
    if root.tag.split('}')[-1]!='svg': return {'valid':False,'reason':'Root must be SVG'}
    for element in root.iter():
        if element.tag.split('}')[-1] not in allowed: return {'valid':False,'reason':'Unsupported active or external element'}
        for key,value in element.attrib.items():
            name=key.split('}')[-1].lower()
            if name.startswith('on') or name in ('href','src','style') or 'url(' in value.lower() or 'javascript:' in value.lower():
                return {'valid':False,'reason':'Active content, references and inline styles are not accepted by this conservative checker'}
    return {'valid':True,'reason':'Static subset accepted; visual quality still requires rendered review'}


def main(argv=None):
    import argparse,json
    from pathlib import Path
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('source');a=p.parse_args(argv)
    try:
        path=Path(a.source)
        result=check_svg(path.read_text(encoding='utf-8')) if path.stat().st_size<=1_000_000 else {'valid':False,'reason':'File too large'}
    except OSError: result={'valid':False,'reason':'Unreadable file'}
    print(json.dumps(result,ensure_ascii=False));return 0 if result['valid'] else 1


if __name__=='__main__':raise SystemExit(main())
