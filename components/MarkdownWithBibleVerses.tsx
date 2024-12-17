// components/MarkdownWithBibleVerses.tsx

import React from 'react';
import ReactMarkdown, { Components } from 'react-markdown';
import { BibleVerse } from './BibleVerse';
import { extractReferences } from '@/utils/bibleUtils';


interface MarkdownWithBibleVersesProps {
  content: string;
}

export function MarkdownWithBibleVerses({ content }: MarkdownWithBibleVersesProps) {
  const renderWithBibleVerses = (children: React.ReactNode): React.ReactNode => {
    if (typeof children === 'string') {
      const parts = [];
      let lastIndex = 0;
      const references = extractReferences(children);
      
      references.forEach((reference) => {
        const index = children.indexOf(reference, lastIndex);
        if (index > lastIndex) {
          parts.push(children.slice(lastIndex, index));
        }
        parts.push(<BibleVerse key={index} reference={reference} />);
        lastIndex = index + reference.length;
      });
      
      if (lastIndex < children.length) {
        parts.push(children.slice(lastIndex));
      }
      
      return <>{parts}</>;
    }
    
    if (Array.isArray(children)) {
      return children.map((child) => 
        typeof child === 'string' ? renderWithBibleVerses(child) : child
      );
    }
    
    return children;
  };
  
  const MarkdownComponents: Components = {
    h1: ({ ...props }) => <h1 className="text-3xl font-bold mt-6 mb-4" {...props} />,
    h2: ({ ...props }) => <h2 className="text-2xl font-semibold mt-4 mb-3" {...props} />,
    h3: ({ ...props }) => <h3 className="text-xl font-semibold mt-3 mb-2" {...props} />,
    h4: ({ ...props }) => <h4 className="text-lg font-semibold mt-2 mb-1" {...props} />,
    p: ({ ...props }) => <p className="mb-4" {...props} />,
    ul: ({ children, ...props }) => <ul className="list-disc pl-6 mb-4" {...props}>
        {renderWithBibleVerses(children)}
      </ul>,
    ol: ({ children, ...props }) => 
      <ol className="list-decimal pl-6 mb-4" {...props}>
        {renderWithBibleVerses(children)}
      </ol>,
    li: ({ children, ...props }) => (
      <li className="mb-1" {...props}>
        {renderWithBibleVerses(children)}
      </li>
    ),
    strong: ({ ...props }) => <strong className="font-semibold" {...props} />,
  };
  
  const customComponents: Components = {
    ...MarkdownComponents,
    p: ({ children }) => <p className="mb-4">{renderWithBibleVerses(children)}</p>,
  };

  return <ReactMarkdown components={customComponents}>{content}</ReactMarkdown>;
}
