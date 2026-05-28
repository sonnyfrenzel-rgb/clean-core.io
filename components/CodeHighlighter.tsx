'use client';

import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

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
