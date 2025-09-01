import DOMPurify from 'dompurify';

/**
 * Sanitizes HTML content to prevent XSS attacks while preserving safe formatting
 * Specifically configured for educational content and worksheets
 */
export function sanitizeHTML(dirty: string): string {
  // Handle server-side sanitization safely
  if (typeof window === 'undefined') {
    // On server-side, return empty string for safety
    // The actual content will be sanitized and rendered on client-side hydration
    return '';
  }

  // Configure DOMPurify to allow safe HTML tags but remove dangerous ones
  const clean = DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: [
      // Text formatting
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'p', 'br', 'hr',
      'strong', 'b', 'em', 'i', 'u',
      'span', 'div',
      
      // Lists
      'ul', 'ol', 'li',
      
      // Tables
      'table', 'thead', 'tbody', 'tr', 'th', 'td',
      
      // Links (with restrictions)
      'a',
      
      // Semantic elements
      'section', 'article', 'aside', 'nav',
      'header', 'footer', 'main',
      
      // Quotes and citations
      'blockquote', 'q', 'cite',
      
      // Code
      'pre', 'code',
      
      // Definition lists
      'dl', 'dt', 'dd',
      
      // Other formatting
      'sub', 'sup', 'mark', 'del', 'ins'
    ],
    ALLOWED_ATTR: [
      // Global attributes
      'class', 'id', 'style',
      
      // Link attributes (restricted)
      'href', 'target', 'rel',
      
      // Table attributes
      'colspan', 'rowspan',
      
      // Accessibility
      'role', 'aria-label', 'aria-describedby'
    ],
    // Don't allow any scripts, iframes, or other potentially dangerous elements
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'img', 'video', 'audio', 'form', 'input', 'button'],
    FORBID_ATTR: ['onerror', 'onclick', 'onload', 'onmouseover'],
    // Keep text content of removed elements
    KEEP_CONTENT: true,
    // Don't allow data: URLs or javascript: protocols
    ALLOW_DATA_ATTR: false,
    // Only allow safe URI schemes
    ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
    // Ensure links open in new window with proper security
    ADD_ATTR: ['target', 'rel'],
    SANITIZE_DOM: true
  });

  // Additional processing to ensure links are safe
  if (typeof window !== 'undefined') {
    // Create a template element for safer parsing
    const template = document.createElement('template');
    
    // Use DOMPurify again with RETURN_DOM option to get DOM elements directly
    const cleanDOM = DOMPurify.sanitize(dirty, {
      ...{
        ALLOWED_TAGS: [
          // Text formatting
          'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
          'p', 'br', 'hr',
          'strong', 'b', 'em', 'i', 'u',
          'span', 'div',
          
          // Lists
          'ul', 'ol', 'li',
          
          // Tables
          'table', 'thead', 'tbody', 'tr', 'th', 'td',
          
          // Links (with restrictions)
          'a',
          
          // Semantic elements
          'section', 'article', 'aside', 'nav',
          'header', 'footer', 'main',
          
          // Quotes and citations
          'blockquote', 'q', 'cite',
          
          // Code
          'pre', 'code',
          
          // Definition lists
          'dl', 'dt', 'dd',
          
          // Other formatting
          'sub', 'sup', 'mark', 'del', 'ins'
        ],
        ALLOWED_ATTR: [
          // Global attributes
          'class', 'id', 'style',
          
          // Link attributes (restricted)
          'href', 'target', 'rel',
          
          // Table attributes
          'colspan', 'rowspan',
          
          // Accessibility
          'role', 'aria-label', 'aria-describedby'
        ],
        // Don't allow any scripts, iframes, or other potentially dangerous elements
        FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'img', 'video', 'audio', 'form', 'input', 'button'],
        FORBID_ATTR: ['onerror', 'onclick', 'onload', 'onmouseover'],
        // Keep text content of removed elements
        KEEP_CONTENT: true,
        // Don't allow data: URLs or javascript: protocols
        ALLOW_DATA_ATTR: false,
        // Only allow safe URI schemes
        ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
        // Ensure links open in new window with proper security
        ADD_ATTR: ['target', 'rel'],
        SANITIZE_DOM: true
      },
      RETURN_DOM: true,
      RETURN_DOM_FRAGMENT: true
    }) as DocumentFragment;
    
    // Ensure all links open in new tab with proper security
    const links = cleanDOM.querySelectorAll('a');
    links.forEach(link => {
      link.setAttribute('target', '_blank');
      link.setAttribute('rel', 'noopener noreferrer');
    });
    
    // Safely serialize the DOM back to string
    const container = document.createElement('div');
    container.appendChild(cleanDOM);
    return container.innerHTML;
  }

  return clean;
}

/**
 * Get sanitized HTML object for dangerouslySetInnerHTML
 * Note: This is not a React hook, just a utility function
 */
export function getSanitizedHTML(html: string): { __html: string } {
  const sanitized = sanitizeHTML(html);
  return { __html: sanitized };
}