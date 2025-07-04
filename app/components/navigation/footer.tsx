import Link from 'next/link';

export default function FooterMinimal() {
  return (
    <footer className="bg-white border-t border-gray-200 mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div className="flex flex-col sm:flex-row justify-between items-center space-y-2 sm:space-y-0">
          {/* Copyright */}
          <p className="text-sm text-gray-500">
            © {new Date().getFullYear()} Speddy. All rights reserved.
          </p>

          {/* Legal Links */}
          <div className="flex space-x-6">
            <Link href="/terms" className="text-sm text-gray-500 hover:text-gray-900">
              Terms
            </Link>
            <Link href="/privacy" className="text-sm text-gray-500 hover:text-gray-900">
              Privacy
            </Link>
            <Link href="/ferpa" className="text-sm text-gray-500 hover:text-gray-900">
              FERPA
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}