export default function FERPAPage() {
  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white shadow-sm rounded-lg p-8 md:p-12">
          {/* Header */}
          <div className="mb-8 text-center">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">FERPA Compliance Notice</h1>
            <p className="text-gray-600">Last Updated: [DATE]</p>
          </div>

          {/* Content */}
          <div className="prose prose-gray max-w-none">
            <section className="mb-8">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Overview</h2>
              <p className="text-gray-700 mb-4">
                Speddy is committed to protecting the privacy of student educational records in compliance with the Family Educational Rights and Privacy Act (FERPA), 20 U.S.C. § 1232g.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Our Role Under FERPA</h2>
              <p className="text-gray-700 mb-4">When providing services to educational institutions, Speddy operates as:</p>
              <ul className="list-disc pl-6 mb-4 text-gray-700">
                <li><strong>A "School Official"</strong> with legitimate educational interests</li>
                <li><strong>Under direct control</strong> of the school district regarding education records</li>
                <li><strong>Subject to FERPA's</strong> use and re-disclosure requirements</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">What is FERPA?</h2>
              <p className="text-gray-700 mb-4">
                FERPA is a federal law that protects the privacy of student education records. It gives parents certain rights regarding their children's education records, which transfer to students at age 18.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">How Speddy Ensures FERPA Compliance</h2>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-6">
                <h3 className="text-lg font-semibold text-gray-800 mb-3">1. Limited Access</h3>
                <ul className="list-disc pl-6 text-gray-700">
                  <li>Only authorized school personnel can access student data</li>
                  <li>Each user sees only their assigned students</li>
                  <li>Role-based permissions restrict data access</li>
                </ul>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-6">
                <h3 className="text-lg font-semibold text-gray-800 mb-3">2. Purpose Limitation</h3>
                <p className="text-gray-700 mb-2">We use student data ONLY for:</p>
                <ul className="list-disc pl-6 text-gray-700">
                  <li>Scheduling special education services</li>
                  <li>Tracking IEP-related sessions</li>
                  <li>Generating required documentation</li>
                  <li>Facilitating service delivery</li>
                </ul>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-6">
                <h3 className="text-lg font-semibold text-gray-800 mb-3">3. No Unauthorized Disclosure</h3>
                <p className="text-gray-700 mb-2">We NEVER:</p>
                <ul className="list-disc pl-6 text-gray-700">
                  <li>Sell student data</li>
                  <li>Share data for marketing purposes</li>
                  <li>Disclose records without proper authorization</li>
                  <li>Use student data for purposes beyond service delivery</li>
                </ul>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-6">
                <h3 className="text-lg font-semibold text-gray-800 mb-3">4. Security Measures</h3>
                <ul className="list-disc pl-6 text-gray-700">
                  <li>Encryption of all data in transit and at rest</li>
                  <li>Secure authentication systems</li>
                  <li>Regular security audits</li>
                  <li>Employee training on FERPA requirements</li>
                </ul>
              </div>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Parent and Eligible Student Rights</h2>
              <p className="text-gray-700 mb-4">Under FERPA, parents and eligible students have the right to:</p>
              <ol className="list-decimal pl-6 mb-4 text-gray-700">
                <li><strong>Inspect and Review</strong> education records</li>
                <li><strong>Request Corrections</strong> to inaccurate records</li>
                <li><strong>Consent to Disclosures</strong> (with certain exceptions)</li>
                <li><strong>File a Complaint</strong> with the U.S. Department of Education</li>
              </ol>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Directory Information</h2>
              <p className="text-gray-700 mb-4">
                Speddy does not collect or maintain directory information. All student data is treated as confidential educational records.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Data Minimization</h2>
              <p className="text-gray-700 mb-4">We practice data minimization by:</p>
              <ul className="list-disc pl-6 mb-4 text-gray-700">
                <li>Collecting only essential information for service delivery</li>
                <li>Using initials instead of full names where possible</li>
                <li>Not collecting unnecessary personal information</li>
                <li>Allowing schools to control what data is entered</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Consent and Authorization</h2>
              <p className="text-gray-700 mb-4">
                Schools must ensure they have appropriate consent before entering student data into Speddy. We rely on schools to:
              </p>
              <ul className="list-disc pl-6 mb-4 text-gray-700">
                <li>Obtain necessary parental consent</li>
                <li>Verify authorized user access</li>
                <li>Maintain consent documentation</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Audit Rights</h2>
              <p className="text-gray-700 mb-4">Schools maintain the right to:</p>
              <ul className="list-disc pl-6 mb-4 text-gray-700">
                <li>Audit our FERPA compliance</li>
                <li>Review access logs</li>
                <li>Request compliance documentation</li>
                <li>Inspect security measures</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Subprocessors and Third Parties</h2>
              <p className="text-gray-700 mb-4">Our subprocessors who may process educational data:</p>
              <ul className="list-disc pl-6 mb-4 text-gray-700">
                <li><strong>Supabase</strong>: Database services (FERPA-compliant infrastructure)</li>
                <li><strong>Anthropic</strong>: AI services (receives only anonymized prompts)</li>
              </ul>
              <p className="text-gray-700 mb-4">
                Stripe processes payments but never receives student data.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Data Retention and Deletion</h2>
              <ul className="list-disc pl-6 mb-4 text-gray-700">
                <li>Data is retained while students are actively receiving services</li>
                <li>Schools control retention periods</li>
                <li>Data is permanently deleted upon school request</li>
                <li>No data is retained after contract termination</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Training and Awareness</h2>
              <p className="text-gray-700 mb-4">All Speddy team members with potential access to student data:</p>
              <ul className="list-disc pl-6 mb-4 text-gray-700">
                <li>Receive FERPA training</li>
                <li>Sign confidentiality agreements</li>
                <li>Understand use limitations</li>
                <li>Follow data protection protocols</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Incident Response</h2>
              <p className="text-gray-700 mb-4">In case of any incident potentially affecting student data:</p>
              <ol className="list-decimal pl-6 mb-4 text-gray-700">
                <li>Immediate containment measures</li>
                <li>Notification to affected schools within 48 hours</li>
                <li>Full cooperation with school investigation</li>
                <li>Remediation and prevention measures</li>
              </ol>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">School Responsibilities</h2>
              <p className="text-gray-700 mb-4">Schools using Speddy must:</p>
              <ul className="list-disc pl-6 mb-4 text-gray-700">
                <li>Designate Speddy as a "school official" in their FERPA notice</li>
                <li>Ensure users are authorized to access student records</li>
                <li>Maintain appropriate consent documentation</li>
                <li>Supervise use of student data in the system</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Questions and Complaints</h2>

              <div className="bg-gray-100 p-6 rounded-lg mb-4">
                <h3 className="text-lg font-semibold text-gray-800 mb-3">For FERPA questions about Speddy:</h3>
                <p className="text-gray-700">
                  Blair Stewart<br />
                  [EMAIL PLACEHOLDER]<br />
                  [ADDRESS PLACEHOLDER]
                </p>
              </div>

              <div className="bg-gray-100 p-6 rounded-lg mb-4">
                <h3 className="text-lg font-semibold text-gray-800 mb-3">For FERPA complaints:</h3>
                <p className="text-gray-700">
                  Family Policy Compliance Office<br />
                  U.S. Department of Education<br />
                  400 Maryland Avenue, SW<br />
                  Washington, DC 20202-8520
                </p>
              </div>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Annual Notification</h2>
              <p className="text-gray-700 mb-4">
                Schools should include Speddy in their annual FERPA notification as a designated school official with legitimate educational interests in:
              </p>
              <ul className="list-disc pl-6 mb-4 text-gray-700">
                <li>Scheduling special education services</li>
                <li>Maintaining service delivery records</li>
                <li>Supporting IEP implementation</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Best Practices for Schools</h2>

              <div className="bg-green-50 border border-green-200 rounded-lg p-6 mb-4">
                <h3 className="text-lg font-semibold text-gray-800 mb-3">1. User Management</h3>
                <ul className="list-disc pl-6 text-gray-700">
                  <li>Regularly review user access</li>
                  <li>Remove access for departed employees</li>
                  <li>Use role-based permissions appropriately</li>
                </ul>
              </div>

              <div className="bg-green-50 border border-green-200 rounded-lg p-6 mb-4">
                <h3 className="text-lg font-semibold text-gray-800 mb-3">2. Data Entry</h3>
                <ul className="list-disc pl-6 text-gray-700">
                  <li>Enter minimum necessary information</li>
                  <li>Use initials when full names aren't required</li>
                  <li>Verify accuracy of entered data</li>
                </ul>
              </div>

              <div className="bg-green-50 border border-green-200 rounded-lg p-6 mb-4">
                <h3 className="text-lg font-semibold text-gray-800 mb-3">3. Consent Documentation</h3>
                <ul className="list-disc pl-6 text-gray-700">
                  <li>Maintain records of parental consent</li>
                  <li>Document legitimate educational interest</li>
                  <li>Keep authorization records current</li>
                </ul>
              </div>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Compliance Certification</h2>
              <p className="text-gray-700 mb-4">Speddy certifies that:</p>
              <ul className="list-disc pl-6 mb-4 text-gray-700">
                <li>We understand FERPA requirements</li>
                <li>We will use education records only as directed</li>
                <li>We will not disclose records without authorization</li>
                <li>We maintain appropriate security safeguards</li>
              </ul>
            </section>

            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 mt-8">
              <p className="text-gray-700 text-sm italic">
                This notice is provided for informational purposes. Schools should consult their own legal counsel regarding FERPA compliance.
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