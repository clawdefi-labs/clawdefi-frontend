"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

export default function MobileNav() {
  const [isOpen, setIsOpen] = useState(false);

  // Prevent scroll when menu is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [isOpen]);

  const toggleMenu = () => setIsOpen(!isOpen);
  const closeMenu = () => setIsOpen(false);

  return (
    <div className="mobile-nav-container">
      <button 
        type="button"
        className={`menu-toggle ${isOpen ? "is-active" : ""}`} 
        onClick={toggleMenu}
        aria-label="Toggle menu"
      >
        <span></span>
        <span></span>
        <span></span>
      </button>

      <div className={`mobile-menu-overlay ${isOpen ? "is-open" : ""}`}>
        <nav className="mobile-nav-links">
          <a href="#install" className="mobile-nav-link" onClick={closeMenu}>Install</a>
          <a href="#runtime" className="mobile-nav-link" onClick={closeMenu}>What can ClawDeFi do</a>
          <a href="#modules" className="mobile-nav-link" onClick={closeMenu}>Roadmap</a>
          <a href="#runtime" className="mobile-nav-link" onClick={closeMenu}>Runtime</a>
          <a href="#modules" className="mobile-nav-link" onClick={closeMenu}>Modules</a>
          <a href="/skill.md" className="mobile-nav-pill" onClick={closeMenu}>skill.md</a>
        </nav>
      </div>
    </div>
  );
}
