export default function FERPAPage() {
  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white shadow-sm rounded-lg p-8 md:p-12">
          {/* Header */}
          <div className="mb-8 text-center">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">FERPA Compliance Notice</h1>
            <p className="text-gray-600">Last Updated: January 19, 2026</p>
          </div>

          {/* Content */}
          <div className="prose prose-gray max-w-none">
            <section className="mb-8">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Overview</h2>
              <p className="text-gray-700 mb-4">
                This notice explains how Speddy supports individual education providers in maintaining compliance with the Family Educational Rights and Privacy Act (FERPA), 20 U.S.C. § 1232g, when working with student educational records.
              </p>
              <p className="text-gray-700 mb-4">
                As an individual provider using Speddy, you play a crucial role in protecting student privacy while delivering essential educational services.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">What is FERPA?</h2>
              <p className="text-gray-700 mb-4">
                FERPA is a federal law that protects the privacy of student education records. It gives parents certain rights regarding their children's education records, which transfer to students when they reach age 18 or attend a postsecondary institution.
              </p>
              <p className="text-gray-700 mb-4">
                FERPA applies to all educational agencies and institutions that receive funding under any program administered by the U.S. Department of Education, including the school districts where you provide services.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Your Role as a Provider Under FERPA</h2>
              <p className="text-gray-700 mb-4">When using Speddy in your professional capacity, you operate as:</p>
              <ul className="list-disc pl-6 mb-4 text-gray-700">
                <li><strong>A "School Official"</strong> with legitimate educational interests in student records</li>
                <li><strong>An authorized representative</strong> of the school district with access to specific student data</li>
                <li><strong>A professional bound by FERPA's</strong> use and re-disclosure requirements</li>
                <li><strong>A steward of student privacy</strong> responsible for protecting educational records</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Your FERPA Responsibilities</h2>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-6">
                <h3 className="text-lg font-semibold text-gray-800 mb-3">1. Authorized Access Only</h3>
                <ul className="list-disc pl-6 text-gray-700">
                  <li>Access only student records for students you are authorized to serve</li>
                  <li>Ensure your school district has designated you as having legitimate educational interest</li>
                  <li>Do not access records out of curiosity or for non-educational purposes</li>
                  <li>Verify your authorization before entering any student data</li>
                </ul>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-6">
                <h3 className="text-lg font-semibold text-gray-800 mb-3">2. Maintain Confidentiality</h3>
                <ul className="list-disc pl-6 text-gray-700">
                  <li>Protect student information from unauthorized disclosure</li>
                  <li>Do not share login credentials or allow unauthorized access to your account</li>
                  <li>Keep screens secure when viewing student data</li>
                  <li>Follow your professional code of ethics regarding confidentiality</li>
                </ul>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-6">
                <h3 className="text-lg font-semibold text-gray-800 mb-3">3. Appropriate Use of Data</h3>
                <ul className="list-disc pl-6 text-gray-700">
                  <li>Use student data only for authorized educational purposes</li>
                  <li>Document services and progress accurately and professionally</li>
                  <li>Share information only with other authorized school officials when necessary</li>
                  <li>Do not use student data for personal, commercial, or non-educational purposes</li>
                </ul>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-6">
                <h3 className="text-lg font-semibold text-gray-800 mb-3">4. Re-disclosure Restrictions</h3>
                <ul className="list-disc pl-6 text-gray-700">
                  <li>Do not re-disclose student information without proper authorization</li>
                  <li>Obtain written consent before sharing information outside the school context</li>
                  <li>Understand exceptions that allow disclosure (health/safety emergencies, etc.)</li>
                  <li>Consult with school administrators when unsure about disclosure requirements</li>
                </ul>
              </div>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">How Speddy Supports Your FERPA Compliance</h2>

              <h3 className="text-lg font-semibold text-gray-800 mt-6 mb-3">Technical Safeguards</h3>
              <ul className="list-disc pl-6 mb-4 text-gray-700">
                <li>Role-based access controls ensure you see only authorized student data</li>
                <li>Secure authentication protects against unauthorized access</li>
                <li>Encrypted data transmission and storage</li>
                <li>Audit logs track all data access and modifications</li>
                <li>Automatic session timeouts for security</li>
              </ul>

              <h3 className="text-lg font-semibold text-gray-800 mt-6 mb-3">Administrative Safeguards</h3>
              <ul className="list-disc pl-6 mb-4 text-gray-700">
                <li>Verification of school district email addresses during registration</li>
                <li>Data minimization - only essential information is collected</li>
                <li>Clear data retention and deletion policies</li>
                <li>Regular security assessments and updates</li>
                <li>Staff training on FERPA requirements</li>
              </ul>

              <h3 className="text-lg font-semibold text-gray-800 mt-6 mb-3">Operational Safeguards</h3>
              <ul className="list-disc pl-6 mb-4 text-gray-700">
                <li>Data is compartmentalized by school district and provider authorization</li>
                <li>No marketing or commercial use of student data</li>
                <li>Transparent privacy practices and policies</li>
                <li>Incident response procedures for any potential breaches</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Data Handling Best Practices</h2>
              <p className="text-gray-700 mb-4">As a provider using Speddy, follow these best practices:</p>

              <h3 className="text-lg font-semibold text-gray-800 mt-6 mb-3">Before Using Student Data</h3>
              <ul className="list-disc pl-6 mb-4 text-gray-700">
                <li>Confirm you are authorized to serve the student</li>
                <li>Verify the student is on your caseload or service roster</li>
                <li>Ensure you have received proper FERPA training from your district</li>
                <li>Review your district's specific FERPA policies and procedures</li>
              </ul>

              <h3 className="text-lg font-semibold text-gray-800 mt-6 mb-3">While Entering Data</h3>
              <ul className="list-disc pl-6 mb-4 text-gray-700">
                <li>Use professional, objective language in all documentation</li>
                <li>Enter only information necessary for service delivery</li>
                <li>Double-check accuracy of all data entered</li>
                <li>Use privacy-protective identifiers when possible (initials, student IDs)</li>
              </ul>

              <h3 className="text-lg font-semibold text-gray-800 mt-6 mb-3">When Sharing Information</h3>
              <ul className="list-disc pl-6 mb-4 text-gray-700">
                <li>Share only with other authorized school officials who need the information</li>
                <li>Use secure methods of communication within the school system</li>
                <li>Obtain proper consent before sharing with external parties</li>
                <li>Document any disclosures as required by your district</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Data Retention and Deletion</h2>
              <ul className="list-disc pl-6 mb-4 text-gray-700">
                <li>Student data is retained only while you are actively providing services</li>
                <li>Data retention follows your school district's established policies</li>
                <li>When you no longer serve a student, access to their data is removed</li>
                <li>Upon account termination, all associated student data is handled according to district requirements</li>
                <li>You may request data deletion in accordance with FERPA and district policies</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Incident Response and Reporting</h2>
              <p className="text-gray-700 mb-4">If you suspect any privacy incident or unauthorized access:</p>
              <ol className="list-decimal pl-6 mb-4 text-gray-700">
                <li><strong>Immediately</strong> change your password and secure your account</li>
                <li><strong>Report the incident</strong> to your school district administration</li>
                <li><strong>Contact Speddy support</strong> to investigate and document the incident</li>
                <li><strong>Follow your district's</strong> incident response procedures</li>
                <li><strong>Cooperate fully</strong> with any investigation or remediation efforts</li>
              </ol>
              <p className="text-gray-700 mb-4">
                <strong>Remember:</strong> Prompt reporting protects both students and yourself from potential harm.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Your Professional Obligations</h2>
              <p className="text-gray-700 mb-4">Beyond FERPA, you must also comply with:</p>
              <ul className="list-disc pl-6 mb-4 text-gray-700">
                <li>Your professional licensing requirements and codes of ethics</li>
                <li>Your school district's policies and procedures</li>
                <li>State and federal special education laws</li>
                <li>Professional standards for documentation and record-keeping</li>
                <li>Confidentiality requirements specific to your role</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">School District Coordination</h2>
              <p className="text-gray-700 mb-4">To ensure FERPA compliance, school districts should:</p>
              <ul className="list-disc pl-6 mb-4 text-gray-700">
                <li>Include individual providers in their annual FERPA notification to parents</li>
                <li>Designate authorized providers as "school officials" with legitimate educational interests</li>
                <li>Provide FERPA training to all providers who access student data</li>
                <li>Establish clear policies for provider access to student records</li>
                <li>Monitor and audit provider compliance with privacy requirements</li>
                <li>Maintain documentation of provider authorization and training</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Directory Information</h2>
              <p className="text-gray-700 mb-4">
                Speddy does not collect or maintain directory information. All student data entered by providers is treated as confidential educational records requiring appropriate protection under FERPA.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Parent and Student Rights</h2>
              <p className="text-gray-700 mb-4">You should be aware that parents and eligible students have rights under FERPA to:</p>
              <ul className="list-disc pl-6 mb-4 text-gray-700">
                <li>Inspect and review the student's education records</li>
                <li>Request amendment of records they believe are inaccurate</li>
                <li>Provide written consent before disclosure of personally identifiable information</li>
                <li>File complaints with the U.S. Department of Education regarding FERPA violations</li>
              </ul>
              <p className="text-gray-700 mb-4">
                Refer any parent or student requests regarding these rights to your school district administration.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Training and Ongoing Compliance</h2>
              <p className="text-gray-700 mb-4">To maintain FERPA compliance:</p>
              <ul className="list-disc pl-6 mb-4 text-gray-700">
                <li>Complete annual FERPA training provided by your school district</li>
                <li>Stay updated on changes to FERPA regulations and district policies</li>
                <li>Participate in professional development on student privacy</li>
                <li>Review and acknowledge Speddy's privacy policies annually</li>
                <li>Report any concerns or questions about FERPA compliance promptly</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Questions and Support</h2>
              <p className="text-gray-700 mb-4">
                For questions about FERPA compliance or student privacy:
              </p>
              <ul className="list-disc pl-6 mb-4 text-gray-700">
                <li><strong>District-specific questions:</strong> Contact your school district's FERPA officer or administration</li>
                <li><strong>Speddy technical questions:</strong> Contact our support team</li>
                <li><strong>General FERPA questions:</strong> Consult the U.S. Department of Education's FERPA resources</li>
                <li><strong>Professional questions:</strong> Consult your professional supervisor or licensing board</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Additional Resources</h2>
              <p className="text-gray-700 mb-4">For more information about FERPA:</p>
              <ul className="list-disc pl-6 mb-4 text-gray-700">
                <li>U.S. Department of Education FERPA website: <em>studentprivacy.ed.gov</em></li>
                <li>Your school district's FERPA policies and procedures</li>
                <li>Professional association guidance on student privacy</li>
                <li>State education department privacy resources</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Contact Information</h2>
              <p className="text-gray-700 mb-4">
                For FERPA-related questions about Speddy:
              </p>
              <div className="bg-gray-100 p-4 rounded-lg">
                <p className="text-gray-700">
                  <strong>Orchestrate LLC</strong><br />
                  Privacy Officer<br />
                  help@speddy.xyz<br />
                </p>
              </div>
            </section>
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