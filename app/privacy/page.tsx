export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white shadow-sm rounded-lg p-8 md:p-12">
          {/* Header */}
          <div className="mb-8 text-center">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Privacy Policy</h1>
            <p className="text-gray-600">Last Updated: [DATE]</p>
          </div>

          {/* Content */}
          <div className="prose prose-gray max-w-none">
            <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-4">1. Introduction</h2>
            <p className="text-gray-700 mb-4">
              Blair Stewart ("we," "us," or "our") operates Speddy, a special education scheduling and management platform. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our Service.
            </p>
            <p className="text-gray-700 mb-4">
              By using Speddy, you consent to the data practices described in this policy.
            </p>

            <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-4">2. Information We Collect</h2>

            <h3 className="text-lg font-semibold text-gray-800 mt-6 mb-3">2.1 Information You Provide</h3>
            <p className="text-gray-700 mb-4">We collect information you directly provide, including:</p>
            <ul className="list-disc pl-6 mb-4 text-gray-700">
              <li><strong>Account Information</strong>: Name, email address, password, role, school district, and school site</li>
              <li><strong>Profile Information</strong>: Professional credentials and contact information</li>
              <li><strong>Student Information</strong>: Student initials, grade levels, IEP data, session notes, and educational records</li>
              <li><strong>Usage Data</strong>: Schedules, session logs, and platform interactions</li>
              <li><strong>Payment Information</strong>: Billing details processed securely through Stripe</li>
            </ul>

            <h3 className="text-lg font-semibold text-gray-800 mt-6 mb-3">2.2 Automatically Collected Information</h3>
            <p className="text-gray-700 mb-4">When you use Speddy, we automatically collect:</p>
            <ul className="list-disc pl-6 mb-4 text-gray-700">
              <li>Device information (browser type, operating system)</li>
              <li>IP address</li>
              <li>Access times and dates</li>
              <li>Pages viewed</li>
            </ul>

            <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-4">3. How We Use Your Information</h2>
            <p className="text-gray-700 mb-4">We use collected information to:</p>
            <ul className="list-disc pl-6 mb-4 text-gray-700">
              <li>Provide and maintain the Service</li>
              <li>Process transactions and send billing information</li>
              <li>Send administrative information (updates, security alerts)</li>
              <li>Respond to inquiries and provide support</li>
              <li>Improve and personalize the Service</li>
              <li>Monitor and analyze usage patterns</li>
              <li>Comply with legal obligations</li>
            </ul>

            <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-4">4. Legal Basis for Processing (GDPR)</h2>
            <p className="text-gray-700 mb-4">For users in applicable jurisdictions, we process personal data based on:</p>
            <ul className="list-disc pl-6 mb-4 text-gray-700">
              <li><strong>Contract</strong>: To fulfill our service agreement with you</li>
              <li><strong>Consent</strong>: Where you have given explicit consent</li>
              <li><strong>Legitimate Interests</strong>: To operate and improve our Service</li>
              <li><strong>Legal Obligations</strong>: To comply with applicable laws</li>
            </ul>

            <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-4">5. Information Sharing and Disclosure</h2>

            <h3 className="text-lg font-semibold text-gray-800 mt-6 mb-3">5.1 We DO NOT sell your personal information</h3>

            <h3 className="text-lg font-semibold text-gray-800 mt-6 mb-3">5.2 We may share information with:</h3>
            <ul className="list-disc pl-6 mb-4 text-gray-700">
              <li><strong>Service Providers</strong>:
                <ul className="list-disc pl-6 mt-2">
                  <li>Supabase (database and authentication)</li>
                  <li>Stripe (payment processing)</li>
                  <li>Anthropic (AI features for lesson planning)</li>
                </ul>
              </li>
              <li><strong>Legal Requirements</strong>: When required by law or to protect rights</li>
              <li><strong>Business Transfers</strong>: In connection with mergers or acquisitions</li>
              <li><strong>Consent</strong>: With your explicit consent</li>
            </ul>

            <h3 className="text-lg font-semibold text-gray-800 mt-6 mb-3">5.3 Educational Records</h3>
            <p className="text-gray-700 mb-4">
              We handle student data in compliance with FERPA. We do not disclose educational records without appropriate consent except as permitted by law.
            </p>

            <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-4">6. Data Security</h2>
            <p className="text-gray-700 mb-4">
              We implement appropriate technical and organizational measures to protect your information, including:
            </p>
            <ul className="list-disc pl-6 mb-4 text-gray-700">
              <li>Encryption of data in transit and at rest</li>
              <li>Regular security assessments</li>
              <li>Access controls and authentication</li>
              <li>Secure data storage through Supabase</li>
            </ul>
            <p className="text-gray-700 mb-4">
              However, no method of transmission over the Internet is 100% secure.
            </p>

            <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-4">7. Data Retention</h2>
            <p className="text-gray-700 mb-4">We retain your information for as long as:</p>
            <ul className="list-disc pl-6 mb-4 text-gray-700">
              <li>Your account is active</li>
              <li>Necessary to provide services</li>
              <li>Required for legal obligations</li>
              <li>Needed to resolve disputes</li>
            </ul>
            <p className="text-gray-700 mb-4">
              You may request deletion of your account and associated data at any time.
            </p>

            <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-4">8. Your Rights and Choices</h2>

            <h3 className="text-lg font-semibold text-gray-800 mt-6 mb-3">8.1 Access and Portability</h3>
            <p className="text-gray-700 mb-4">
              You can access and export your data through your account settings.
            </p>

            <h3 className="text-lg font-semibold text-gray-800 mt-6 mb-3">8.2 Correction</h3>
            <p className="text-gray-700 mb-4">
              You can update information through your account or contact us.
            </p>

            <h3 className="text-lg font-semibold text-gray-800 mt-6 mb-3">8.3 Deletion</h3>
            <p className="text-gray-700 mb-4">
              You may request account and data deletion by contacting us.
            </p>

            <h3 className="text-lg font-semibold text-gray-800 mt-6 mb-3">8.4 California Privacy Rights</h3>
            <p className="text-gray-700 mb-4">California residents have additional rights under CCPA, including:</p>
            <ul className="list-disc pl-6 mb-4 text-gray-700">
              <li>Right to know what personal information is collected</li>
              <li>Right to delete personal information</li>
              <li>Right to opt-out of sale (we do not sell personal information)</li>
              <li>Right to non-discrimination</li>
            </ul>

            <h3 className="text-lg font-semibold text-gray-800 mt-6 mb-3">8.5 Canadian Privacy Rights</h3>
            <p className="text-gray-700 mb-4">Canadian users have rights under PIPEDA, including:</p>
            <ul className="list-disc pl-6 mb-4 text-gray-700">
              <li>Access to personal information</li>
              <li>Challenge accuracy and completeness</li>
              <li>Know how information is used</li>
            </ul>

            <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-4">9. Children's Privacy</h2>
            <p className="text-gray-700 mb-4">
              Speddy is not intended for users under 18. We do not knowingly collect information from children under 18. While we process student data as part of our Service, this data is provided by authorized educators, not directly from students.
            </p>

            <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-4">10. International Data Transfers</h2>
            <p className="text-gray-700 mb-4">
              If you access Speddy from outside the United States, your information may be transferred to and processed in the United States. By using Speddy, you consent to this transfer.
            </p>

            <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-4">11. Cookies and Tracking</h2>
            <p className="text-gray-700 mb-4">
              We currently do not use cookies or tracking technologies. If this changes, we will update this policy and obtain appropriate consents.
            </p>

            <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-4">12. Third-Party Links</h2>
            <p className="text-gray-700 mb-4">
              Speddy may contain links to third-party websites. We are not responsible for the privacy practices of these external sites.
            </p>

            <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-4">13. Changes to This Policy</h2>
            <p className="text-gray-700 mb-4">
              We may update this Privacy Policy periodically. Changes become effective immediately upon posting. We will notify you of material changes via email or Service notification.
            </p>

            <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-4">14. Contact Information</h2>
            <p className="text-gray-700 mb-4">
              For privacy-related questions or to exercise your rights, contact:
            </p>
            <div className="bg-gray-100 p-4 rounded-lg mb-4">
              <p className="text-gray-700">
                <strong>Data Controller:</strong><br />
                Blair Stewart<br />
                [EMAIL PLACEHOLDER]<br />
                [ADDRESS PLACEHOLDER]
              </p>
            </div>
            <p className="text-gray-700 mb-4">
              For privacy complaints, you may also contact your local data protection authority.
            </p>

            <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-4">15. Specific Provisions for Educational Data</h2>

            <h3 className="text-lg font-semibold text-gray-800 mt-6 mb-3">15.1 FERPA Compliance</h3>
            <p className="text-gray-700 mb-4">
              We acknowledge our responsibilities under FERPA when handling educational records and will:
            </p>
            <ul className="list-disc pl-6 mb-4 text-gray-700">
              <li>Use educational records only for providing the Service</li>
              <li>Not disclose records without appropriate consent</li>
              <li>Maintain appropriate security measures</li>
              <li>Allow school officials to review records</li>
            </ul>

            <h3 className="text-lg font-semibold text-gray-800 mt-6 mb-3">15.2 School Official Designation</h3>
            <p className="text-gray-700 mb-4">
              When providing services, we may be designated as a "school official" under FERPA with legitimate educational interests.
            </p>

            <h3 className="text-lg font-semibold text-gray-800 mt-6 mb-3">15.3 Data Ownership</h3>
            <p className="text-gray-700 mb-4">
              Schools and districts retain ownership of all student data. We claim no ownership rights to educational records.
            </p>

            <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-4">16. Payment Information</h2>
            <p className="text-gray-700 mb-4">
              Payment processing is handled by Stripe. We do not store credit card numbers or banking information on our servers. Please review Stripe's privacy policy for information about their data practices.
            </p>

            <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-4">17. AI Features</h2>
            <p className="text-gray-700 mb-4">
              When you use AI-powered features (lesson planning), prompts and generated content are processed by Anthropic. We do not use student data to train AI models. Generated content is stored in your account for your use.
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