"use client";

import { useState } from "react";
import { useAuth } from "../../components/providers/auth-provider";
import Link from "next/link";
import { useRouter } from "next/navigation";

const PROVIDER_ROLES = [
  { value: "resource_specialist", label: "Resource Specialist" },
  { value: "speech_therapist", label: "Speech Therapist" },
  { value: "occupational_therapist", label: "Occupational Therapist" },
  { value: "counselor", label: "Counselor" },
  { value: "program_specialist", label: "Program Specialist" },
  { value: "sea", label: "Special Education Assistant" },
  { value: "other", label: "Other Special Education Provider" },
];

export function SignupForm() {
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    confirmPassword: "",
    fullName: "",
    role: "",
    schoolDistrict: "",
    schoolSite: "",
    supervisingProviderEmail: "",
    multipleSchools: 'no' // default to single school
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const { signUp } = useAuth();
  const router = useRouter();
  const [isSEARole, setIsSEARole] = useState(false);

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
    if (formData.password.length < 6) {
      setError("Password must be at least 6 characters");
      setLoading(false);
      return;
    }

    const { error } = await signUp(formData.email, formData.password, {
      full_name: formData.fullName,
      role: formData.role,
      school_district: formData.schoolDistrict,
      school_site: formData.schoolSite,
    });

    if (error) {
      console.error("Signup error details:", error);
      setError(error.message);
      setLoading(false);
    } else {
      setSuccess(true);
      setTimeout(() => {
        router.push("/login");
      }, 3000);
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
        <p className="text-sm text-gray-600">Redirecting to login...</p>
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
          Enter your full school district name
        </p>
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
          Enter full school name (no abbreviations)
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

      <div>
        <label
          htmlFor="password"
          className="block text-sm font-medium text-gray-700"
        >
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          value={formData.password}
          onChange={handleChange}
          className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
        />
        <p className="mt-1 text-xs text-gray-500">At least 6 characters</p>
      </div>

      <div>
        <label
          htmlFor="confirmPassword"
          className="block text-sm font-medium text-gray-700"
        >
          Confirm Password
        </label>
        <input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          required
          value={formData.confirmPassword}
          onChange={handleChange}
          className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
        />
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
      
      <div>
        <button
          type="submit"
          disabled={loading}
          className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "Creating account..." : "Create account"}
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