'use client';

import { PrismLight as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

// Register only the languages actually used in the app (~30KB instead of 608KB)
import sql from 'react-syntax-highlighter/dist/esm/languages/prism/sql';
import json from 'react-syntax-highlighter/dist/esm/languages/prism/json';
import markdown from 'react-syntax-highlighter/dist/esm/languages/prism/markdown';
import typescript from 'react-syntax-highlighter/dist/esm/languages/prism/typescript';
import docker from 'react-syntax-highlighter/dist/esm/languages/prism/docker';

SyntaxHighlighter.registerLanguage('sql', sql);
SyntaxHighlighter.registerLanguage('json', json);
SyntaxHighlighter.registerLanguage('markdown', markdown);
SyntaxHighlighter.registerLanguage('typescript', typescript);
SyntaxHighlighter.registerLanguage('dockerfile', docker);

export default function CodeHighlighter({ language, code, customStyle }: { language: string, code: string, customStyle?: any }) {
  // Map 'abap' to a supported language or fallback to text if not perfectly supported by Prism
  // Prism supports many languages, but if abap isn't there, it will gracefully fallback.
  const lang = language === 'abap' ? 'sql' : language; // sql is a decent fallback for ABAP keywords if abap is missing

  return (
    <SyntaxHighlighter 
      language={lang} 
      style={vscDarkPlus}
      customStyle={{ 
        margin: 0, 
        padding: '1em', 
        backgroundColor: '#1e1e1e', 
        fontSize: '13px',
        height: '100%',
        ...customStyle 
      }}
    >
      {code}
    </SyntaxHighlighter>
  );
}

