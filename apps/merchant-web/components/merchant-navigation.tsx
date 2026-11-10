'use client';

import { useEffect, useRef, useState } from 'react';

const plannedItems = ['Transactions', 'Payment links', 'Settlements', 'Developers'];

export function MerchantNavigation() {
  const [isOpen, setIsOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape' && isOpen) {
        setIsOpen(false);
        menuButtonRef.current?.focus();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  return (
    <aside className="sidebar" aria-label="Merchant navigation">
      <div className="sidebar-header">
        <a className="brand" href="/" aria-label="Payflow sandbox overview">
          <span aria-hidden="true" className="brand-mark">
            P
          </span>
          <span>Payflow</span>
        </a>
        <button
          ref={menuButtonRef}
          className="mobile-menu-button"
          type="button"
          aria-controls="merchant-navigation"
          aria-expanded={isOpen}
          onClick={() => setIsOpen((current) => !current)}
        >
          <span className="visually-hidden">
            {isOpen ? 'Close navigation menu' : 'Open navigation menu'}
          </span>
          <span aria-hidden="true" className="hamburger-icon">
            <span />
            <span />
            <span />
          </span>
        </button>
      </div>
      <nav
        id="merchant-navigation"
        className={isOpen ? 'primary-nav primary-nav-open' : 'primary-nav'}
      >
        <ul className="nav-list">
          <li>
            <a
              className="nav-item nav-item-active"
              href="#main-content"
              onClick={() => setIsOpen(false)}
            >
              Overview
            </a>
          </li>
          {plannedItems.map((item) => (
            <li key={item}>
              <button className="nav-item" disabled type="button">
                {item}
                <span className="planned-label">Planned</span>
              </button>
            </li>
          ))}
        </ul>
      </nav>
      <div className="sidebar-footer">
        <span className="environment-dot" aria-hidden="true" />
        Sandbox environment
      </div>
    </aside>
  );
}
