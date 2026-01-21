export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white shadow-sm rounded-lg p-8 md:p-12">
          {/* Header */}
          <div className="mb-8 text-center">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Privacy Policy</h1>
            <p className="text-gray-600">Last Updated: January 19, 2026</p>
          </div>

          {/* Content */}
          <div className="prose prose-gray max-w-none">
            <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-4">1. Introduction</h2>
            <p className="text-gray-700 mb-4">
              This Privacy Policy describes how Orchestrate LLC ("we," "us," or "our") collects, uses, and protects information when you use Speddy ("Service"). This policy is designed for individual education professionals who use Speddy in their work with students in school settings.
            </p>

            <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-4">2. Information We Collect</h2>

            <h3 className="text-lg font-semibold text-gray-800 mt-6 mb-3">2.1 Provider Account Information</h3>
            <p className="text-gray-700 mb-4">When you create an account, we collect:</p>
            <ul className="list-disc pl-6 mb-4 text-gray-700">
              <li>Your name and professional contact information</li>
              <li>School district email address</li>
              <li>Professional role and credentials</li>
              <li>School district and work location</li>
              <li>Login credentials (encrypted)</li>
            </ul>

            <h3 className="text-lg font-semibold text-gray-800 mt-6 mb-3">2.2 Student Educational Data</h3>
            <p className="text-gray-700 mb-4">As an authorized education professional, you may input student data including:</p>
            <ul className="list-disc pl-6 mb-4 text-gray-700">
              <li>Student identifiers (typically initials or student IDs)</li>
              <li>Grade level and program information</li>
              <li>Service schedules and appointments</li>
              <li>IEP goals and progress data (when authorized)</li>
              <li>Session notes and service documentation</li>
              <li>Assessment data (when authorized)</li>
            </ul>
            <p className="text-gray-700 mb-4">
              <strong>Important:</strong> You are responsible for ensuring you are authorized to access and input all student data you enter into Speddy.
            </p>

            <h3 className="text-lg font-semibold text-gray-800 mt-6 mb-3">2.3 Usage Information</h3>
            <p className="text-gray-700 mb-4">We automatically collect:</p>
            <ul className="list-disc pl-6 mb-4 text-gray-700">
              <li>Log data (IP address, browser type, pages visited)</li>
              <li>Device information</li>
              <li>Usage patterns and feature utilization</li>
              <li>Error reports and performance data</li>
            </ul>

            <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-4">3. How We Use Information</h2>

            <h3 className="text-lg font-semibold text-gray-800 mt-6 mb-3">3.1 Provider Account Data</h3>
            <p className="text-gray-700 mb-4">We use your professional information to:</p>
            <ul className="list-disc pl-6 mb-4 text-gray-700">
              <li>Provide and maintain your Speddy account</li>
              <li>Verify your authorization to access the Service</li>
              <li>Provide customer support</li>
              <li>Send important service updates and notifications</li>
              <li>Ensure compliance with professional and legal requirements</li>
            </ul>

            <h3 className="text-lg font-semibold text-gray-800 mt-6 mb-3">3.2 Student Educational Data</h3>
            <p className="text-gray-700 mb-4">Student data is used solely to:</p>
            <ul className="list-disc pl-6 mb-4 text-gray-700">
              <li>Provide the scheduling and management tools you need</li>
              <li>Generate reports and documentation for your professional use</li>
              <li>Facilitate your authorized educational services</li>
              <li>Maintain accurate records as required by law</li>
            </ul>
            <p className="text-gray-700 mb-4">
              <strong>We never use student data for marketing, advertising, or any commercial purposes beyond providing the Service.</strong>
            </p>

            <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-4">4. Information Sharing and Disclosure</h2>

            <h3 className="text-lg font-semibold text-gray-800 mt-6 mb-3">4.1 Student Data Sharing</h3>
            <p className="text-gray-700 mb-4">
              We do not sell, rent, or share student educational data with third parties except:
            </p>
            <ul className="list-disc pl-6 mb-4 text-gray-700">
              <li>With other authorized providers at the same school who need access for legitimate educational purposes</li>
              <li>When required by law or court order</li>
              <li>To protect the safety of students or others</li>
              <li>With your explicit consent for specific purposes</li>
            </ul>

            <h3 className="text-lg font-semibold text-gray-800 mt-6 mb-3">4.2 Provider Data Sharing</h3>
            <p className="text-gray-700 mb-4">We may share your professional information:</p>
            <ul className="list-disc pl-6 mb-4 text-gray-700">
              <li>With other providers at your school for coordination purposes</li>
              <li>When required by law or professional regulations</li>
              <li>With service providers who assist in operating Speddy (under strict confidentiality agreements)</li>
            </ul>

            <h3 className="text-lg font-semibold text-gray-800 mt-6 mb-3">4.3 Service Providers</h3>
            <p className="text-gray-700 mb-4">We work with trusted service providers:</p>
            <ul className="list-disc pl-6 mb-4 text-gray-700">
              <li><strong>Supabase:</strong> Secure database hosting (FERPA-compliant infrastructure)</li>
              <li><strong>Anthropic:</strong> AI assistance (receives only anonymized, non-identifiable prompts)</li>
              <li><strong>Crisp:</strong> Help chat support (may collect user information such as IP address, location, and browser type; users should avoid sharing student data in chat messages)</li>
            </ul>

            <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-4">5. Data Security</h2>
            <p className="text-gray-700 mb-4">We implement comprehensive security measures:</p>
            <ul className="list-disc pl-6 mb-4 text-gray-700">
              <li>End-to-end encryption for all data transmission</li>
              <li>Encrypted data storage with regular security audits</li>
              <li>Multi-factor authentication options</li>
              <li>Role-based access controls</li>
              <li>Regular security updates and monitoring</li>
              <li>Incident response procedures</li>
            </ul>

            <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-4">6. Data Retention</h2>

            <h3 className="text-lg font-semibold text-gray-800 mt-6 mb-3">6.1 Student Data</h3>
            <p className="text-gray-700 mb-4">Student educational data is retained:</p>
            <ul className="list-disc pl-6 mb-4 text-gray-700">
              <li>While you maintain an active account and continue serving the student</li>
              <li>According to your school district's data retention policies</li>
              <li>As required by applicable education laws</li>
              <li>Until you or your school district requests deletion</li>
            </ul>

            <h3 className="text-lg font-semibold text-gray-800 mt-6 mb-3">6.2 Provider Data</h3>
            <p className="text-gray-700 mb-4">Your professional account data is retained:</p>
            <ul className="list-disc pl-6 mb-4 text-gray-700">
              <li>While your account is active</li>
              <li>For up to 90 days after account cancellation for reactivation purposes</li>
              <li>As required by applicable laws and professional regulations</li>
            </ul>

            <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-4">7. Your Rights and Controls</h2>

            <h3 className="text-lg font-semibold text-gray-800 mt-6 mb-3">7.1 Access and Portability</h3>
            <p className="text-gray-700 mb-4">
              You have the right to access, export, and port your professional data. For student data, access rights are governed by FERPA and your school district's policies.
            </p>

            <h3 className="text-lg font-semibold text-gray-800 mt-6 mb-3">7.2 Correction and Updates</h3>
            <p className="text-gray-700 mb-4">
              You can update your professional information through your account settings. You are responsible for maintaining accurate student data according to your professional obligations.
            </p>

            <h3 className="text-lg font-semibold text-gray-800 mt-6 mb-3">7.3 Data Deletion</h3>
            <p className="text-gray-700 mb-4">
              You may request deletion of your account and associated data. Student data deletion requests must comply with FERPA, school district policies, and applicable record retention requirements.
            </p>

            <h3 className="text-lg font-semibold text-gray-800 mt-6 mb-3">7.4 California Privacy Rights</h3>
            <p className="text-gray-700 mb-4">California residents have additional rights under CCPA, including:</p>
            <ul className="list-disc pl-6 mb-4 text-gray-700">
              <li>Right to know what personal information is collected</li>
              <li>Right to delete personal information (subject to FERPA and retention requirements)</li>
              <li>Right to opt-out of sale (we do not sell personal information)</li>
              <li>Right to non-discrimination</li>
            </ul>

            <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-4">8. Professional Responsibilities</h2>
            <p className="text-gray-700 mb-4">As a provider using Speddy, you acknowledge:</p>
            <ul className="list-disc pl-6 mb-4 text-gray-700">
              <li>You are bound by professional codes of ethics regarding confidentiality</li>
              <li>You must comply with FERPA and other applicable privacy laws</li>
              <li>You are responsible for ensuring authorized access to student data</li>
              <li>You must follow your school district's data handling policies</li>
              <li>You should not access student data outside your professional responsibilities</li>
            </ul>

            <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-4">9. Children's Privacy</h2>
            <p className="text-gray-700 mb-4">
              Speddy is designed for use by adult education professionals. We do not knowingly collect information directly from children under 18. Student data is provided by authorized education professionals, not directly from students. All student data handling complies with FERPA and applicable children's privacy laws.
            </p>

            <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-4">10. International Data Transfers</h2>
            <p className="text-gray-700 mb-4">
              If you access Speddy from outside the United States, your information may be transferred to and processed in the United States. By using Speddy, you consent to this transfer. We ensure appropriate safeguards are in place for international data transfers.
            </p>

            <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-4">11. Cookies and Tracking</h2>
            <p className="text-gray-700 mb-4">
              We currently use minimal tracking technologies for essential service functionality only. We do not use cookies for advertising or non-essential tracking. If this changes, we will update this policy and obtain appropriate consents.
            </p>

            <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-4">12. Third-Party Links</h2>
            <p className="text-gray-700 mb-4">
              Speddy may contain links to third-party websites or services. We are not responsible for the privacy practices of these external sites. We encourage you to review the privacy policies of any third-party services you access.
            </p>

            <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-4">13. Changes to This Policy</h2>
            <p className="text-gray-700 mb-4">
              We may update this Privacy Policy periodically to reflect changes in our practices or legal requirements. Material changes become effective 30 days after posting. We will notify you of significant changes via email or Service notification.
            </p>

            <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-4">14. Contact Information</h2>
            <p className="text-gray-700 mb-4">
              For privacy-related questions or to exercise your rights, contact:
            </p>
            <div className="bg-gray-100 p-4 rounded-lg mb-4">
              <p className="text-gray-700">
                <strong>Data Controller:</strong><br />
                Orchestrate LLC<br />
                help@speddy.xyz<br />
              </p>
            </div>
            <p className="text-gray-700 mb-4">
              For privacy complaints, you may also contact your local data protection authority.
            </p>

            <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-4">15. FERPA-Specific Provisions</h2>

            <h3 className="text-lg font-semibold text-gray-800 mt-6 mb-3">15.1 Educational Records</h3>
            <p className="text-gray-700 mb-4">
              When handling student educational records, we acknowledge our responsibilities under FERPA and will:
            </p>
            <ul className="list-disc pl-6 mb-4 text-gray-700">
              <li>Use educational records only for authorized educational purposes</li>
              <li>Not disclose records without appropriate consent or legal authority</li>
              <li>Maintain appropriate security measures</li>
              <li>Allow authorized school officials and parents to review records as required by law</li>
              <li>Comply with record retention and destruction requirements</li>
            </ul>

            <h3 className="text-lg font-semibold text-gray-800 mt-6 mb-3">15.2 Provider as School Official</h3>
            <p className="text-gray-700 mb-4">
              When using Speddy, you may be designated as a "school official" under FERPA with legitimate educational interests. As such, you agree to:
            </p>
            <ul className="list-disc pl-6 mb-4 text-gray-700">
              <li>Use student data only for authorized educational purposes</li>
              <li>Protect the confidentiality of educational records</li>
              <li>Not re-disclose information except as permitted by FERPA</li>
              <li>Comply with your school district's FERPA policies</li>
            </ul>

            <h3 className="text-lg font-semibold text-gray-800 mt-6 mb-3">15.3 Data Ownership</h3>
            <p className="text-gray-700 mb-4">
              School districts retain ownership of all student educational records. We claim no ownership rights to educational records and acknowledge that districts have the right to control access, use, and disclosure of student data.
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