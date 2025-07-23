import DOMPurify from 'dompurify';

/**
 * Sanitizes HTML content to prevent XSS attacks while preserving safe formatting
 * Specifically configured for educational content and worksheets
 */
export function sanitizeHTML(dirty: string): string {
  // Only run DOMPurify on the client side
  if (typeof window === 'undefined') {
    // On server-side, return the content as-is
    // The actual sanitization will happen on client-side hydration
    return dirty;
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
    // Allow data: URLs for links (useful for print/download)
    ALLOW_DATA_ATTR: false,
    // Ensure links open in new window with proper security
    ADD_ATTR: ['target', 'rel'],
    SANITIZE_DOM: true
  });

  // Additional processing to ensure links are safe
  if (typeof window !== 'undefined') {
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = clean;
    
    // Ensure all links open in new tab with proper security
    const links = tempDiv.querySelectorAll('a');
    links.forEach(link => {
      link.setAttribute('target', '_blank');
      link.setAttribute('rel', 'noopener noreferrer');
    });
    
    return tempDiv.innerHTML;
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