"use client";

import { useState } from "react";
import { useAuth } from "../../components/providers/auth-provider";
import Link from "next/link";
import { validatePassword } from "../../../lib/utils/password-validation";
import { PasswordRequirements } from "../../components/auth/password-requirements";
import { PasswordStrengthIndicator } from "../../components/auth/password-strength-indicator";
import { PasswordInput } from "../../components/auth/password-input";

interface SignupFormProps {
  onComplete?: (role: string, email: string) => void;
}

const PROVIDER_ROLES = [
  { value: "resource_specialist", label: "Resource Specialist" },
  { value: "speech_therapist", label: "Speech Therapist" },
  { value: "occupational_therapist", label: "Occupational Therapist" },
  { value: "counselor", label: "Counselor" },
  { value: "program_specialist", label: "Program Specialist" },
  { value: "sea", label: "Special Education Assistant" },
  { value: "other", label: "Other Special Education Provider" },
];

const US_STATES = [
  { value: "AL", label: "Alabama" },
  { value: "AK", label: "Alaska" },
  { value: "AZ", label: "Arizona" },
  { value: "AR", label: "Arkansas" },
  { value: "CA", label: "California" },
  { value: "CO", label: "Colorado" },
  { value: "CT", label: "Connecticut" },
  { value: "DE", label: "Delaware" },
  { value: "FL", label: "Florida" },
  { value: "GA", label: "Georgia" },
  { value: "HI", label: "Hawaii" },
  { value: "ID", label: "Idaho" },
  { value: "IL", label: "Illinois" },
  { value: "IN", label: "Indiana" },
  { value: "IA", label: "Iowa" },
  { value: "KS", label: "Kansas" },
  { value: "KY", label: "Kentucky" },
  { value: "LA", label: "Louisiana" },
  { value: "ME", label: "Maine" },
  { value: "MD", label: "Maryland" },
  { value: "MA", label: "Massachusetts" },
  { value: "MI", label: "Michigan" },
  { value: "MN", label: "Minnesota" },
  { value: "MS", label: "Mississippi" },
  { value: "MO", label: "Missouri" },
  { value: "MT", label: "Montana" },
  { value: "NE", label: "Nebraska" },
  { value: "NV", label: "Nevada" },
  { value: "NH", label: "New Hampshire" },
  { value: "NJ", label: "New Jersey" },
  { value: "NM", label: "New Mexico" },
  { value: "NY", label: "New York" },
  { value: "NC", label: "North Carolina" },
  { value: "ND", label: "North Dakota" },
  { value: "OH", label: "Ohio" },
  { value: "OK", label: "Oklahoma" },
  { value: "OR", label: "Oregon" },
  { value: "PA", label: "Pennsylvania" },
  { value: "RI", label: "Rhode Island" },
  { value: "SC", label: "South Carolina" },
  { value: "SD", label: "South Dakota" },
  { value: "TN", label: "Tennessee" },
  { value: "TX", label: "Texas" },
  { value: "UT", label: "Utah" },
  { value: "VT", label: "Vermont" },
  { value: "VA", label: "Virginia" },
  { value: "WA", label: "Washington" },
  { value: "WV", label: "West Virginia" },
  { value: "WI", label: "Wisconsin" },
  { value: "WY", label: "Wyoming" }
];

export function SignupForm({ onComplete }: SignupFormProps) {
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    confirmPassword: "",
    fullName: "",
    role: "",
    state: "CA", // default to California
    schoolDistrict: "",
    schoolSite: "",
    supervisingProviderEmail: "",
    multipleSchools: 'no', // default to single school
    additionalSchools: ["", "", ""] // for storing multiple school names
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const { signUp } = useAuth();
  const [isSEARole, setIsSEARole] = useState(false);
  const [passwordErrors, setPasswordErrors] = useState<string[]>([]);
  const [showPasswordRequirements, setShowPasswordRequirements] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    // Validate passwords match
    if (formData.password !== formData.confirmPassword) {
      setError("Passwords do not match");
      setLoading(false);
      return;
    }

    // Validate password strength
    const passwordValidation = validatePassword(formData.password);
    if (!passwordValidation.isValid) {
      setError(passwordValidation.errors[0]);
      setLoading(false);
      return;
    }

    // Prepare additional schools array
    let additionalSchoolsArray: string[] = [];

    if (formData.multipleSchools === 'yes') {
      // Filter out empty school names and trim whitespace
      additionalSchoolsArray = formData.additionalSchools
        .filter(school => school.trim() !== '')
        .map(school => school.trim());

      if (additionalSchoolsArray.length === 0) {
        setError("Please enter at least one additional school site");
        setLoading(false);
        return;
      }
    }

    try {
      // Get the mapped role for database
      const roleMap: { [key: string]: string } = {
        resource_specialist: "resource",
        speech_therapist: "speech",
        occupational_therapist: "ot",
        counselor: "counseling",
        program_specialist: "specialist",
        sea: "sea",
        other: "resource", // Default to resource for "other"
      };

      const dbRole = roleMap[formData.role] || formData.role;

      // Log the metadata being sent (for debugging)
      const metadata = {
        full_name: formData.fullName.trim(),
        role: formData.role,
        state: formData.state,
        school_district: formData.schoolDistrict.trim(),
        school_site: formData.schoolSite.trim(),
        works_at_multiple_schools: formData.multipleSchools === 'yes',
        additional_schools: additionalSchoolsArray
      };

      console.log('Signup metadata:', metadata);

      const { error } = await signUp(formData.email, formData.password, metadata);

      if (error) {
        console.error("Signup error details:", error);
        setError(error.message);
        setLoading(false);
      } else {
        setSuccess(true);
        // Call onComplete callback with the mapped role instead of redirecting
        if (onComplete) {
          // Pass the mapped database role, not the form role
          onComplete(dbRole, formData.email);
        }
      }
    } catch (err) {
      console.error("Unexpected signup error:", err);
      setError("An unexpected error occurred. Please try again.");
      setLoading(false);
    }
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    const { name, value } = e.target;

    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));

    // Track if SEA role is selected
    if (name === 'role') {
      setIsSEARole(value === 'sea');
    }
  };

  if (success) {
    return (
      <div className="text-center space-y-4">
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-md">
          <p className="font-medium">Account created successfully!</p>
          <p className="text-sm mt-1">
            Check your email to verify your account before signing in.
          </p>
        </div>
        {isSEARole && (
          <p className="text-sm text-gray-600">
            As a Special Education Assistant, you have free access to Speddy!
          </p>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md text-sm">
          {error}
        </div>
      )}

      <div>
        <label
          htmlFor="fullName"
          className="block text-sm font-medium text-gray-700"
        >
          Full Name
        </label>
        <input
          id="fullName"
          name="fullName"
          type="text"
          required
          value={formData.fullName}
          onChange={handleChange}
          className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
        />
      </div>

      <div>
        <label
          htmlFor="email"
          className="block text-sm font-medium text-gray-700"
        >
          District Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          value={formData.email}
          onChange={handleChange}
          className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
          placeholder="you@district.edu"
        />
        <p className="mt-1 text-xs text-gray-500">
          Must be a valid district email address (.edu)
        </p>
      </div>

      <div>
        <label
          htmlFor="role"
          className="block text-sm font-medium text-gray-700"
        >
          Provider Role
        </label>
        <select
          id="role"
          name="role"
          required
          value={formData.role}
          onChange={handleChange}
          className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
        >
          <option value="">Select your role</option>
          {PROVIDER_ROLES.map((role) => (
            <option key={role.value} value={role.value}>
              {role.label}
            </option>
          ))}
        </select>
        {formData.role === 'sea' && (
          <p className="mt-1 text-xs text-green-600">
            Special Education Assistants get free access to Speddy!
          </p>
        )}
      </div>

      <div>
        <label
          htmlFor="schoolDistrict"
          className="block text-sm font-medium text-gray-700"
        >
          School District
        </label>
        <input
          id="schoolDistrict"
          name="schoolDistrict"
          type="text"
          required
          value={formData.schoolDistrict}
          onChange={handleChange}
          className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
          placeholder="e.g., San Francisco Unified School District"
        />
        <p className="mt-1 text-xs text-gray-500">
          Enter your full school district name (spell correctly!)
        </p>
      </div>

      <div>
        <label
          htmlFor="state"
          className="block text-sm font-medium text-gray-700"
        >
          State
        </label>
        <select
          id="state"
          name="state"
          required
          value={formData.state}
          onChange={handleChange}
          className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
        >
          {US_STATES.map((state) => (
            <option key={state.value} value={state.value}>
              {state.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label
          htmlFor="schoolSite"
          className="block text-sm font-medium text-gray-700"
        >
          School Site Name
        </label>
        <input
          id="schoolSite"
          name="schoolSite"
          type="text"
          required
          value={formData.schoolSite}
          onChange={handleChange}
          className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
          placeholder="Lincoln Elementary School"
        />
        <p className="mt-1 text-xs text-gray-500">
          Enter full school name (no abbreviations - and spell correctly!)
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Do you provide services at multiple schools?
        </label>
        <div className="space-y-2">
          <label className="flex items-center">
            <input
              type="radio"
              name="multipleSchools"
              value="no"
              checked={formData.multipleSchools === 'no'}
              onChange={handleChange}
              className="mr-2"
            />
            <span>No, I work at one school only</span>
          </label>
          <label className="flex items-center">
            <input
              type="radio"
              name="multipleSchools"
              value="yes"
              checked={formData.multipleSchools === 'yes'}
              onChange={handleChange}
              className="mr-2"
            />
            <span>Yes, I work at multiple schools</span>
          </label>
        </div>
      </div>

      {formData.multipleSchools === 'yes' && (
        <div className="mt-4 space-y-2">
          <p className="text-sm font-medium text-gray-700">
            List your additional school sites:
          </p>
          {formData.additionalSchools.map((school, index) => (
            <div key={index} className="flex gap-2">
              <input
                type="text"
                value={school}
                onChange={(e) => {
                  const newSchools = [...formData.additionalSchools];
                  newSchools[index] = e.target.value;
                  setFormData(prev => ({ ...prev, additionalSchools: newSchools }));
                }}
                placeholder={`Additional school site ${index + 1}`}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              />
              {formData.additionalSchools.length > 1 && (
                <button
                  type="button"
                  onClick={() => {
                    const newSchools = formData.additionalSchools.filter((_, i) => i !== index);
                    setFormData(prev => ({ ...prev, additionalSchools: newSchools }));
                  }}
                  className="px-3 py-2 text-sm bg-red-100 text-red-700 rounded-md hover:bg-red-200"
                >
                  Remove
                </button>
              )}
              {index === formData.additionalSchools.length - 1 && (
                <button
                  type="button"
                  onClick={() => {
                    setFormData(prev => ({
                      ...prev,
                      additionalSchools: [...prev.additionalSchools, '']
                    }));
                  }}
                  className="px-3 py-2 text-sm bg-blue-100 text-blue-700 rounded-md hover:bg-blue-200"
                >
                  + Add another
                </button>
              )}
            </div>
          ))}
          <p className="text-xs text-gray-500">
            You'll be able to set your schedule for each school after signup
          </p>
        </div>
      )}

      <div>
        <label
          htmlFor="password"
          className="block text-sm font-medium text-gray-700"
        >
          Password
        </label>
        <PasswordInput
          id="password"
          name="password"
          value={formData.password}
          onChange={handleChange}
          onFocus={() => setShowPasswordRequirements(true)}
          onBlur={() => setShowPasswordRequirements(false)}
          required
        />
        <PasswordStrengthIndicator password={formData.password} />
        <PasswordRequirements 
          password={formData.password} 
          showRequirements={showPasswordRequirements || formData.password.length > 0}
        />
      </div>

      <div>
        <label
          htmlFor="confirmPassword"
          className="block text-sm font-medium text-gray-700"
        >
          Confirm Password
        </label>
        <PasswordInput
          id="confirmPassword"
          name="confirmPassword"
          value={formData.confirmPassword}
          onChange={handleChange}
          required
        />
        {formData.confirmPassword && formData.password !== formData.confirmPassword && (
          <p className="mt-1 text-xs text-red-600">Passwords do not match</p>
        )}
      </div>

      <div className="border border-gray-200 rounded-md p-4 mb-4">
        <h4 className="text-sm font-medium text-gray-900 mb-2">Compliance Checklist</h4>
        <div className="space-y-2">
          <label className="flex items-start">
            <input type="checkbox" required className="mr-2 mt-1" />
            <span className="text-sm text-gray-700">
              I have permission from my institution to use external tools for student data
            </span>
          </label>
          <label className="flex items-start">
            <input type="checkbox" required className="mr-2 mt-1" />
            <span className="text-sm text-gray-700">
              I understand I can only input data for my assigned students
            </span>
          </label>
          <label className="flex items-start">
            <input type="checkbox" required className="mr-2 mt-1" />
            <span className="text-sm text-gray-700">
              I will follow my district's data retention policies
            </span>
          </label>
        </div>
      </div>

      <div className="text-xs text-gray-500 mb-4">
        By creating an account, you agree to our{' '}
        <Link href="/terms" className="text-blue-600 hover:text-blue-500">
          Terms of Service
        </Link>,{' '}
        <Link href="/privacy" className="text-blue-600 hover:text-blue-500">
          Privacy Policy
        </Link>, and{' '}
        <Link href="/ferpa" className="text-blue-600 hover:text-blue-500">
          FERPA Compliance
        </Link>
      </div>
      
      <div>
        <button
          type="submit"
          disabled={loading}
          className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "Creating account..." : isSEARole ? "Create Free Account" : "Create account"}
        </button>
      </div>

      <div className="text-sm text-center">
        <span className="text-gray-600">Already have an account? </span>
        <Link
          href="/login"
          className="font-medium text-blue-600 hover:text-blue-500"
        >
          Sign in
        </Link>
      </div>
    </form>
  );
}