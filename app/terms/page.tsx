export default function TermsPage() {
  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white shadow-sm rounded-lg p-8 md:p-12">
          {/* Header */}
          <div className="mb-8 text-center">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Terms and Conditions</h1>
            <p className="text-gray-600">Last Updated: January 21, 2026</p>
          </div>

          {/* Content */}
          <div className="prose prose-gray max-w-none">
            <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-4">1. Agreement to Terms</h2>
            <p className="text-gray-700 mb-4">
              By accessing or using Speddy ("Service"), operated by Orchestrate LLC ("we," "us," or "our"), you agree to be bound by these Terms and Conditions ("Terms"). If you disagree with any part of these terms, you do not have permission to access the Service.
            </p>

            <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-4">2. Eligibility</h2>
            <p className="text-gray-700 mb-4">
              You must be at least 18 years old and a licensed or certified education professional working in a school setting to use this Service. By using Speddy, you represent and warrant that you are at least 18 years of age, have the legal capacity to enter into these Terms, and are authorized to access student educational records in your professional capacity.
            </p>

            <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-4">3. Account Registration</h2>
            <p className="text-gray-700 mb-4">To use Speddy, you must:</p>
            <ul className="list-disc pl-6 mb-4 text-gray-700">
              <li>Register using your official school district email address (.edu, .org, .k12, or .gov domains)</li>
              <li>Provide accurate, complete, and current information about your professional role and credentials</li>
              <li>Maintain the security of your password and login credentials</li>
              <li>Accept responsibility for all activities under your account</li>
              <li>Notify us immediately of any unauthorized use</li>
              <li>Verify your authorization to access student data in your professional capacity</li>
            </ul>

            <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-4">4. Acceptable Use</h2>
            <p className="text-gray-700 mb-4">
              You agree to use Speddy only for lawful purposes related to your professional duties and in accordance with these Terms. You agree not to:
            </p>
            <ul className="list-disc pl-6 mb-4 text-gray-700">
              <li>Violate any applicable laws, regulations, or school district policies</li>
              <li>Access or attempt to access student data you are not authorized to view</li>
              <li>Share login credentials with unauthorized individuals</li>
              <li>Share or disclose student information outside of your professional duties</li>
              <li>Attempt to gain unauthorized access to any part of the Service</li>
              <li>Upload malicious code or interfere with the Service's operation</li>
              <li>Use the Service for any purpose other than your authorized professional responsibilities</li>
              <li>Input false or misleading student information</li>
            </ul>

            <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-4">5. Intellectual Property</h2>

            <h3 className="text-lg font-semibold text-gray-800 mt-6 mb-3">5.1 Our Property</h3>
            <p className="text-gray-700 mb-4">
              The Service and its original content, features, and functionality are owned by Orchestrate LLC and are protected by international copyright, trademark, and other intellectual property laws.
            </p>

            <h3 className="text-lg font-semibold text-gray-800 mt-6 mb-3">5.2 Your Content</h3>
            <p className="text-gray-700 mb-4">
              You retain professional responsibility for content you create. By using Speddy, you grant us a limited license to use, store, and display your content solely for providing the Service. You acknowledge that any student data remains the property of the respective school district.
            </p>

            <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-4">6. Privacy and Data Protection</h2>
            <p className="text-gray-700 mb-4">
              Your use of Speddy is also governed by our Privacy Policy. By using the Service, you consent to our collection and use of data as described in the Privacy Policy.
            </p>

            <h3 className="text-lg font-semibold text-gray-800 mt-6 mb-3">6.1 Student Data Responsibilities</h3>
            <p className="text-gray-700 mb-4">As an individual provider, you acknowledge that:</p>
            <ul className="list-disc pl-6 mb-4 text-gray-700">
              <li>You are authorized by your employing school district to access the student data you enter</li>
              <li>You have received necessary training on FERPA and applicable privacy laws</li>
              <li>You will only access and input data for students you are authorized to serve</li>
              <li>You are responsible for the accuracy of data you enter</li>
              <li>You will not share student information outside of your professional duties</li>
              <li>You understand your role as a "school official" under FERPA</li>
            </ul>

            <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-4">7. Disclaimers</h2>

            <h3 className="text-lg font-semibold text-gray-800 mt-6 mb-3">7.1 Professional Responsibility</h3>
            <p className="text-gray-700 mb-4">
              Speddy is a tool to assist with your professional scheduling and data management. You remain solely responsible for all professional decisions, student services, and compliance with applicable laws and district policies.
            </p>

            <h3 className="text-lg font-semibold text-gray-800 mt-6 mb-3">7.2 Educational Outcomes</h3>
            <p className="text-gray-700 mb-4">
              We do not guarantee any specific educational outcomes from using Speddy. The Service is a tool to assist with scheduling and management, not a guarantee of educational or therapeutic success.
            </p>

            <h3 className="text-lg font-semibold text-gray-800 mt-6 mb-3">7.3 Legal and Professional Advice</h3>
            <p className="text-gray-700 mb-4">
              Speddy does not provide legal advice regarding IEPs, special education law, professional standards, or compliance requirements. Consult appropriate legal counsel and professional supervisors for guidance on professional and legal questions.
            </p>

            <h3 className="text-lg font-semibold text-gray-800 mt-6 mb-3">7.4 Data Accuracy</h3>
            <p className="text-gray-700 mb-4">
              You are solely responsible for the accuracy of data entered into Speddy. We are not liable for errors resulting from inaccurate data input or professional decisions based on such data.
            </p>

            <h3 className="text-lg font-semibold text-gray-800 mt-6 mb-3">7.5 Service Availability</h3>
            <p className="text-gray-700 mb-4">
              We strive for high availability but do not guarantee uninterrupted access. The Service is provided "AS IS" without warranties of any kind.
            </p>

            <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-4">8. Limitation of Liability</h2>
            <p className="text-gray-700 mb-4">
              To the maximum extent permitted by law, Orchestrate LLC shall not be liable for any indirect, incidental, special, consequential, or punitive damages, including loss of profits, data, or use, arising from your use of Speddy. This includes any professional liability or educational outcomes.
            </p>

            <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-4">9. Indemnification</h2>
            <p className="text-gray-700 mb-4">
              You agree to indemnify and hold harmless Orchestrate LLC from any claims, damages, or expenses arising from:
            </p>
            <ul className="list-disc pl-6 mb-4 text-gray-700">
              <li>Your violation of these Terms</li>
              <li>Your violation of any third-party rights</li>
              <li>Your unauthorized use of student data</li>
              <li>Your professional conduct or decisions</li>
              <li>Your violation of school district policies or professional standards</li>
            </ul>

            <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-4">10. Termination</h2>
            <p className="text-gray-700 mb-4">
              We may terminate or suspend your account immediately, without prior notice or liability, for any reason whatsoever, including without limitation if you breach the Terms. Upon termination, your right to use the Service will cease immediately, and any student data associated with your account will be handled according to our data retention policies and applicable law.
            </p>

            <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-4">11. Professional Standards</h2>
            <p className="text-gray-700 mb-4">
              You agree to use Speddy in accordance with:
            </p>
            <ul className="list-disc pl-6 mb-4 text-gray-700">
              <li>Your professional licensing requirements</li>
              <li>Applicable professional codes of ethics</li>
              <li>Your employing school district's policies and procedures</li>
              <li>State and federal education laws</li>
              <li>FERPA and other privacy regulations</li>
            </ul>

            <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-4">12. Changes to Terms</h2>
            <p className="text-gray-700 mb-4">
              We reserve the right to modify or replace these Terms at any time. If a revision is material, we will try to provide at least 30 days' notice prior to any new terms taking effect. What constitutes a material change will be determined at our sole discretion.
            </p>

            <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-4">13. Governing Law</h2>
            <p className="text-gray-700 mb-4">
              These Terms shall be interpreted and governed by the laws of the State of California, without regard to its conflict of law provisions. Our failure to enforce any right or provision of these Terms will not be considered a waiver of those rights.
            </p>

            <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-4">14. Contact Information</h2>
            <p className="text-gray-700 mb-4">
              If you have any questions about these Terms and Conditions, please contact us at:
            </p>
            <div className="bg-gray-100 p-4 rounded-lg">
              <p className="text-gray-700">
                <strong>Orchestrate LLC</strong><br />
                help@speddy.xyz<br />
              </p>
            </div>
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