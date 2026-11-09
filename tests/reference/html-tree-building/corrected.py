"""Scoped in-memory current-grammar correction for explicit reference contracts."""
from contextlib import contextmanager
import hashlib
from importlib.metadata import version
import inspect
from pathlib import Path


def digest(value):
    return hashlib.sha256(value).hexdigest()


def implied_end_tags(self, exclude=None):
    while self.openElements[-1].name in {'dd', 'dt', 'li', 'option', 'optgroup', 'p', 'rb', 'rp', 'rt', 'rtc'}:
        if self.openElements[-1].name == exclude:
            break
        self.openElements.pop()


def ruby_base_start(self, token):
    if self.tree.elementInScope('ruby'):
        self.tree.generateImpliedEndTags()
        if self.tree.openElements[-1].name != 'ruby':
            self.parser.parseError()
    self.tree.insertElement(token)


def ruby_text_start(self, token):
    if self.tree.elementInScope('ruby'):
        self.tree.generateImpliedEndTags(exclude='rtc')
        if self.tree.openElements[-1].name not in {'ruby', 'rtc'}:
            self.parser.parseError()
    self.tree.insertElement(token)


@contextmanager
def corrected_grammar():
    from html5rdf import html5parser, _utils
    from html5rdf.treebuilders import base
    assert version('html5rdf') == '1.2.1'
    phase = html5parser.InBodyPhase
    start = phase.__dict__['startTagHandler']
    end = phase.__dict__['endTagHandler']
    implied = base.TreeBuilder.generateImpliedEndTags
    stamp = {
        'scope': 'bounded HTML ruby/search/dialog tree-building contracts',
        'html5rdf': version('html5rdf'),
        'original_modules_sha256': {Path(module.__file__).name: digest(Path(module.__file__).read_bytes())
                                   for module in [html5parser, base]},
        'original_functions_sha256': {name: digest(inspect.getsource(function).encode()) for name, function in {
            'generateImpliedEndTags': implied, 'startTagRpRt': phase.startTagRpRt,
            'startTagCloseP': phase.startTagCloseP, 'endTagBlock': phase.endTagBlock}.items()},
        'correction_sha256': digest(Path(__file__).read_bytes()),
        'rules': ['ruby implied rb/rtc endings and start-tag scope', 'dialog/search paragraph closure',
                  'search block end-tag handling'],
        'serializer': 'unchanged pinned html5rdf serializer',
    }
    modern_start = _utils.MethodDispatcher(start.items())
    modern_start.default = start.default
    modern_end = _utils.MethodDispatcher(end.items())
    modern_end.default = end.default
    for name in ['dialog', 'search']:
        modern_start[name] = phase.startTagCloseP
    for name in ['rb', 'rtc']:
        modern_start[name] = ruby_base_start
    for name in ['rp', 'rt']:
        modern_start[name] = ruby_text_start
    modern_end['search'] = phase.endTagBlock
    try:
        phase.startTagHandler = modern_start
        phase.endTagHandler = modern_end
        base.TreeBuilder.generateImpliedEndTags = implied_end_tags
        yield stamp
    finally:
        phase.startTagHandler = start
        phase.endTagHandler = end
        base.TreeBuilder.generateImpliedEndTags = implied
        assert phase.__dict__['startTagHandler'] is start
        assert phase.__dict__['endTagHandler'] is end
        assert base.TreeBuilder.generateImpliedEndTags is implied
