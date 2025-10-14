// components/BackToTop.tsx

"use client"

import React, { useEffect, useState } from 'react';

export const BackToTop: React.FC = () => {
  const [showButton, setShowButton] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      // Show button when user scrolls down 300 pixels
      setShowButton(window.scrollY > 300);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToTop = () => {
    // Smoothly scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    showButton && (
      <button
        onClick={scrollToTop}
        className="fixed bottom-4 right-4 p-3 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring"
        aria-label="Back to top"
      >
        ↑
      </button>
    )
  );
};
