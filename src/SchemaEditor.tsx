import { memo } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { StreamLanguage } from '@codemirror/language';

const dbml = StreamLanguage.define({
  token(stream) {
    if (stream.eatSpace()) return null;
    if (stream.match('//')) { stream.skipToEnd(); return 'comment'; }
    if (stream.match(/\b(Table|Ref|Enum|indexes)\b/i)) return 'keyword';
    if (stream.match(/\b(pk|unique|not null|increment|primary key)\b/i)) return 'atom';
    if (stream.match(/\b(uuid|integer|int|varchar|text|timestamp|boolean|decimal)\b/i)) return 'typeName';
    if (stream.match(/\d+/)) return 'number';
    if (stream.match(/[{}\[\]><:.,()-]/)) return 'punctuation';
    stream.match(/\w+/) || stream.next(); return 'variableName';
  },
});
const extensions = [dbml];
const basicSetup = { foldGutter: false, highlightActiveLine: true, autocompletion: false };

// Moving a table does not change the code. Keep CodeMirror and its extensions
// intact while the diagram updates, preserving scroll and selection as well.
export default memo(function SchemaEditor({ source, onChange }: { source: string; onChange: (source: string) => void }) {
  return <CodeMirror value={source} onChange={onChange} extensions={extensions} theme="dark" height="100%"
    aria-label="แก้ไขโค้ดโครงสร้างฐานข้อมูล" basicSetup={basicSetup} />;
});
