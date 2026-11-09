"""RFC 5646 ABNF well-formedness; registry validity is deliberately separate."""
import re

GRANDFATHERED = frozenset('''en-GB-oed i-ami i-bnn i-default i-enochian i-hak
    i-klingon i-lux i-mingo i-navajo i-pwn i-tao i-tay i-tsu sgn-BE-FR
    sgn-BE-NL sgn-CH-DE art-lojban cel-gaulish no-bok no-nyn zh-guoyu
    zh-hakka zh-min zh-min-nan zh-xiang'''.lower().split())
LANGTAG = re.compile(
    r'(?:[a-z]{2,3}(?:-[a-z]{3}){0,3}|[a-z]{4}|[a-z]{5,8})'
    r'(?:-[a-z]{4})?(?:-(?:[a-z]{2}|[0-9]{3}))?'
    r'(?:-(?:[a-z0-9]{5,8}|[0-9][a-z0-9]{3}))*'
    r'(?:-[0-9a-wy-z](?:-[a-z0-9]{2,8})+)*'
    r'(?:-x(?:-[a-z0-9]{1,8})+)?', re.ASCII | re.IGNORECASE)
PRIVATE = re.compile(r'x(?:-[a-z0-9]{1,8})+', re.ASCII | re.IGNORECASE)

def well_formed(value):
    return isinstance(value, str) and value.isascii() and (value.lower() in GRANDFATHERED or
        LANGTAG.fullmatch(value) is not None or PRIVATE.fullmatch(value) is not None)
