export default function TermsPage() {
  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white shadow-sm rounded-lg p-8 md:p-12">
          {/* Header */}
          <div className="mb-8 text-center">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Terms and Conditions</h1>
            <p className="text-gray-600">Last Updated: [DATE]</p>
          </div>

          {/* Content */}
          <div className="prose prose-gray max-w-none">
            <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-4">1. Agreement to Terms</h2>
            <p className="text-gray-700 mb-4">
              By accessing or using Speddy ("Service"), operated by Blair Stewart ("we," "us," or "our"), you agree to be bound by these Terms and Conditions ("Terms"). If you disagree with any part of these terms, you do not have permission to access the Service.
            </p>

            <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-4">2. Eligibility</h2>
            <p className="text-gray-700 mb-4">
              You must be at least 18 years old to use this Service. By using Speddy, you represent and warrant that you are at least 18 years of age and have the legal capacity to enter into these Terms.
            </p>

            <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-4">3. Account Registration</h2>
            <p className="text-gray-700 mb-4">To use Speddy, you must:</p>
            <ul className="list-disc pl-6 mb-4 text-gray-700">
              <li>Register using your official school district email address (.edu, .org, .k12, or .gov domains)</li>
              <li>Provide accurate, complete, and current information</li>
              <li>Maintain the security of your password</li>
              <li>Accept responsibility for all activities under your account</li>
              <li>Notify us immediately of any unauthorized use</li>
            </ul>

            <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-4">4. Acceptable Use</h2>
            <p className="text-gray-700 mb-4">
              You agree to use Speddy only for lawful purposes and in accordance with these Terms. You agree not to:
            </p>
            <ul className="list-disc pl-6 mb-4 text-gray-700">
              <li>Violate any applicable laws or regulations</li>
              <li>Infringe upon the rights of others</li>
              <li>Share login credentials</li>
              <li>Attempt to gain unauthorized access to any part of the Service</li>
              <li>Upload malicious code or interfere with the Service's operation</li>
              <li>Use the Service for any purpose other than special education management</li>
            </ul>

            <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-4">5. Subscription and Payment</h2>

            <h3 className="text-lg font-semibold text-gray-800 mt-6 mb-3">5.1 Free Trial</h3>
            <p className="text-gray-700 mb-4">
              New users receive a 30-day free trial. After the trial period, continued use requires a paid subscription.
            </p>

            <h3 className="text-lg font-semibold text-gray-800 mt-6 mb-3">5.2 Subscription Terms</h3>
            <ul className="list-disc pl-6 mb-4 text-gray-700">
              <li>Subscriptions are billed monthly</li>
              <li>Payment is processed through Stripe</li>
              <li>Prices are subject to change with 30 days' notice</li>
              <li>You authorize us to charge your payment method on a recurring basis</li>
            </ul>

            <h3 className="text-lg font-semibold text-gray-800 mt-6 mb-3">5.3 Cancellation</h3>
            <p className="text-gray-700 mb-4">
              You may cancel your subscription at any time. Cancellation takes effect at the end of the current billing period.
            </p>

            <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-4">6. Intellectual Property</h2>

            <h3 className="text-lg font-semibold text-gray-800 mt-6 mb-3">6.1 Our Property</h3>
            <p className="text-gray-700 mb-4">
              The Service and its original content, features, and functionality are owned by Blair Stewart and are protected by international copyright, trademark, and other intellectual property laws.
            </p>

            <h3 className="text-lg font-semibold text-gray-800 mt-6 mb-3">6.2 Your Content</h3>
            <p className="text-gray-700 mb-4">
              You retain ownership of content you create. By using Speddy, you grant us a license to use, store, and display your content solely for providing the Service.
            </p>

            <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-4">7. Privacy and Data Protection</h2>
            <p className="text-gray-700 mb-4">
              Your use of Speddy is also governed by our Privacy Policy. By using the Service, you consent to our collection and use of data as described in the Privacy Policy.
            </p>

            <h3 className="text-lg font-semibold text-gray-800 mt-6 mb-3">7.1 Student Data</h3>
            <p className="text-gray-700 mb-4">You acknowledge that:</p>
            <ul className="list-disc pl-6 mb-4 text-gray-700">
              <li>You have obtained necessary permissions to input student data</li>
              <li>You will comply with FERPA and applicable privacy laws</li>
              <li>You are responsible for data accuracy</li>
            </ul>

            <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-4">8. Disclaimers</h2>

            <h3 className="text-lg font-semibold text-gray-800 mt-6 mb-3">8.1 Educational Outcomes</h3>
            <p className="text-gray-700 mb-4">
              We do not guarantee any specific educational outcomes from using Speddy. The Service is a tool to assist with scheduling and management, not a guarantee of educational success.
            </p>

            <h3 className="text-lg font-semibold text-gray-800 mt-6 mb-3">8.2 Legal Advice</h3>
            <p className="text-gray-700 mb-4">
              Speddy does not provide legal advice regarding IEPs, special education law, or compliance. Consult appropriate legal counsel for legal questions.
            </p>

            <h3 className="text-lg font-semibold text-gray-800 mt-6 mb-3">8.3 Data Accuracy</h3>
            <p className="text-gray-700 mb-4">
              You are solely responsible for the accuracy of data entered into Speddy. We are not liable for errors resulting from inaccurate data input.
            </p>

            <h3 className="text-lg font-semibold text-gray-800 mt-6 mb-3">8.4 Service Availability</h3>
            <p className="text-gray-700 mb-4">
              We strive for high availability but do not guarantee uninterrupted access. The Service is provided "AS IS" without warranties of any kind.
            </p>

            <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-4">9. Limitation of Liability</h2>
            <p className="text-gray-700 mb-4">
              To the maximum extent permitted by law, Blair Stewart shall not be liable for any indirect, incidental, special, consequential, or punitive damages, including loss of profits, data, or use, arising from your use of Speddy.
            </p>

            <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-4">10. Indemnification</h2>
            <p className="text-gray-700 mb-4">
              You agree to indemnify and hold harmless Blair Stewart from any claims, damages, or expenses arising from:
            </p>
            <ul className="list-disc pl-6 mb-4 text-gray-700">
              <li>Your violation of these Terms</li>
              <li>Your violation of any third-party rights</li>
              <li>Your use of the Service</li>
            </ul>

            <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-4">11. Account Termination</h2>
            <p className="text-gray-700 mb-4">
              We may terminate or suspend your account immediately, without prior notice, for:
            </p>
            <ul className="list-disc pl-6 mb-4 text-gray-700">
              <li>Non-payment of subscription fees</li>
              <li>Violation of these Terms</li>
              <li>Inappropriate use of the Service</li>
              <li>At our sole discretion for any reason</li>
            </ul>
            <p className="text-gray-700 mb-4">
              Upon termination, your right to use the Service will cease immediately.
            </p>

            <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-4">12. Dispute Resolution</h2>

            <h3 className="text-lg font-semibold text-gray-800 mt-6 mb-3">12.1 Arbitration</h3>
            <p className="text-gray-700 mb-4">
              Any dispute arising from these Terms shall be resolved through binding arbitration in California, except where prohibited by law.
            </p>

            <h3 className="text-lg font-semibold text-gray-800 mt-6 mb-3">12.2 Governing Law</h3>
            <p className="text-gray-700 mb-4">
              These Terms are governed by the laws of California, without regard to conflict of law principles.
            </p>

            <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-4">13. Changes to Terms</h2>
            <p className="text-gray-700 mb-4">
              We reserve the right to modify these Terms at any time. Changes become effective immediately upon posting. Continued use constitutes acceptance of modified Terms.
            </p>

            <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-4">14. Contact Information</h2>
            <p className="text-gray-700 mb-4">
              For questions about these Terms, contact us at:
            </p>
            <div className="bg-gray-100 p-4 rounded-lg mb-4">
              <p className="text-gray-700">
                Blair Stewart<br />
                [EMAIL PLACEHOLDER]<br />
                [ADDRESS PLACEHOLDER]
              </p>
            </div>

            <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-4">15. Severability</h2>
            <p className="text-gray-700 mb-4">
              If any provision of these Terms is deemed invalid or unenforceable, the remaining provisions continue in full force and effect.
            </p>

            <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-4">16. Entire Agreement</h2>
            <p className="text-gray-700 mb-4">
              These Terms constitute the entire agreement between you and Blair Stewart regarding Speddy and supersede all prior agreements.
            </p>
          </div>

          {/* Back to home link */}
          <div className="mt-12 text-center">
            <a href="/login" className="text-blue-600 hover:text-blue-500 font-medium">
              Return to Login
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}