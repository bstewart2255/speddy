"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../../components/providers/auth-provider";
import Link from "next/link";
import { validatePassword } from "../../../lib/utils/password-validation";
import { PasswordRequirements } from "../../components/auth/password-requirements";
import { PasswordStrengthIndicator } from "../../components/auth/password-strength-indicator";
import { PasswordInput } from "../../components/auth/password-input";
import { createClient } from '@/lib/supabase/client';


interface SignupFormProps {
  onComplete?: (role: string, email: string) => void;
}

interface State {
  id: string;
  name: string;
  full_name: string;
}

interface District {
  id: string;
  name: string;
  state_id: string;
}

interface School {
  id: string;
  name: string;
  district_id: string;
  school_type?: string;
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
    additionalSchools: ["", "", ""], // for storing multiple school names
    // New fields for structured data
    state_id: "CA",
    district_id: "",
    school_id: ""
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const { signUp } = useAuth();
  const [isSEARole, setIsSEARole] = useState(false);
  const [passwordErrors, setPasswordErrors] = useState<string[]>([]);
  const [showPasswordRequirements, setShowPasswordRequirements] = useState(false);
  
  // New state for dropdown data
  const [states, setStates] = useState<State[]>([]);
  const [districts, setDistricts] = useState<District[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [loadingStates, setLoadingStates] = useState(true);
  const [loadingDistricts, setLoadingDistricts] = useState(false);
  const [loadingSchools, setLoadingSchools] = useState(false);
  const [districtSearch, setDistrictSearch] = useState("");
  const [schoolSearch, setSchoolSearch] = useState("");
  const [showDistrictDropdown, setShowDistrictDropdown] = useState(false);
  const [showSchoolDropdown, setShowSchoolDropdown] = useState(false);
  
  // Load states on component mount
  useEffect(() => {
    const loadStates = async () => {
      try {
        const response = await fetch('/api/schools/states');
        if (response.ok) {
          const data = await response.json();
          setStates(data);
          // Set California as default if it exists
          const california = data.find((s: State) => s.id === 'CA');
          if (california) {
            setFormData(prev => ({
              ...prev,
              state_id: california.id,
              state: california.id
            }));
          }
        }
      } catch (err) {
        console.error('Failed to load states:', err);
      } finally {
        setLoadingStates(false);
      }
    };
    loadStates();
  }, []);
  
  // Load districts when state changes
  const loadDistricts = useCallback(async (stateId: string, search?: string) => {
    if (!stateId) return;
    
    setLoadingDistricts(true);
    try {
      let url = `/api/schools/districts?state_id=${stateId}`;
      if (search) {
        url += `&search=${encodeURIComponent(search)}`;
      }
      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        setDistricts(data);
      }
    } catch (err) {
      console.error('Failed to load districts:', err);
    } finally {
      setLoadingDistricts(false);
    }
  }, []);
  
  // Load schools when district changes
  const loadSchools = useCallback(async (districtId: string, search?: string) => {
    if (!districtId) return;
    
    setLoadingSchools(true);
    try {
      let url = `/api/schools?district_id=${districtId}`;
      if (search) {
        url += `&search=${encodeURIComponent(search)}`;
      }
      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        setSchools(data);
      }
    } catch (err) {
      console.error('Failed to load schools:', err);
    } finally {
      setLoadingSchools(false);
    }
  }, []);
  
  // Debounced search for districts
  useEffect(() => {
    const timer = setTimeout(() => {
      if (formData.state_id && showDistrictDropdown) {
        loadDistricts(formData.state_id, districtSearch);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [districtSearch, formData.state_id, showDistrictDropdown, loadDistricts]);
  
  // Debounced search for schools
  useEffect(() => {
    const timer = setTimeout(() => {
      if (formData.district_id && showSchoolDropdown) {
        loadSchools(formData.district_id, schoolSearch);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [schoolSearch, formData.district_id, showSchoolDropdown, loadSchools]);

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

  // Validate that school selection is complete
  if (!formData.schoolDistrict || !formData.schoolSite) {
    setError("Please select your school district and school");
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
      additional_schools: additionalSchoolsArray,
      // Include new structured IDs for future use
      state_id: formData.state_id,
      district_id: formData.district_id,
      school_id: formData.school_id
    };

    console.log('Signup metadata:', metadata);

    const { error } = await signUp(formData.email, formData.password, metadata);

    if (error) {
      console.error("Signup error details:", error);
      setError(error.message);
      setLoading(false);
    } else {
      setSuccess(true);

      // Automatically sign in the user after successful signup
      const supabase = createClient();
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email: formData.email,
        password: formData.password,
      });

      if (signInError) {
        console.error("Auto sign-in error:", signInError);
        setError("Account created but couldn't sign in automatically. Please login.");
        setLoading(false);
        return;
      }

      // Wait a moment for the session to be established
      await new Promise(resolve => setTimeout(resolve, 1000));

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
          placeholder="you@school.edu"
        />
        <p className="mt-1 text-xs text-gray-500">
          Use your school or organization email (.edu, .org, etc.)
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
          htmlFor="state"
          className="block text-sm font-medium text-gray-700"
        >
          State
        </label>
        <select
          id="state"
          name="state"
          required
          value={formData.state_id}
          onChange={(e) => {
            const selectedState = states.find(s => s.id === e.target.value);
            if (selectedState) {
              setFormData(prev => ({
                ...prev,
                state: selectedState.id,
                state_id: selectedState.id,
                // Clear dependent fields
                district_id: '',
                school_id: '',
                schoolDistrict: '',
                schoolSite: ''
              }));
              setDistricts([]);
              setSchools([]);
              setDistrictSearch('');
              setSchoolSearch('');
            }
          }}
          disabled={loadingStates}
          className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
        >
          {loadingStates ? (
            <option value="">Loading states...</option>
          ) : (
            states.map((state) => (
              <option key={state.id} value={state.id}>
                {state.full_name}
              </option>
            ))
          )}
        </select>
      </div>

      <div className="relative">
        <label
          htmlFor="district"
          className="block text-sm font-medium text-gray-700"
        >
          School District
        </label>
        <div className="mt-1">
          <input
            id="district"
            type="text"
            required
            value={formData.district_id ? formData.schoolDistrict : districtSearch}
            onChange={(e) => {
              setDistrictSearch(e.target.value);
              if (formData.district_id) {
                // Clear selection if user starts typing
                setFormData(prev => ({
                  ...prev,
                  district_id: '',
                  school_id: '',
                  schoolDistrict: '',
                  schoolSite: ''
                }));
                setSchools([]);
                setSchoolSearch('');
              }
            }}
            onFocus={() => {
              setShowDistrictDropdown(true);
              if (formData.state_id && !districts.length) {
                loadDistricts(formData.state_id);
              }
            }}
            onBlur={(e) => {
              // Delay to allow click on dropdown items
              setTimeout(() => {
                setShowDistrictDropdown(false);
              }, 200);
            }}
            disabled={!formData.state_id || loadingStates}
            placeholder={!formData.state_id ? "Select a state first" : "Search for your district..."}
            className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
          />
          {loadingDistricts && (
            <div className="absolute right-2 top-2">
              <svg className="animate-spin h-5 w-5 text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            </div>
          )}
          {showDistrictDropdown && districts.length > 0 && (
            <div className="absolute z-10 mt-1 w-full bg-white shadow-lg max-h-60 rounded-md py-1 text-base ring-1 ring-black ring-opacity-5 overflow-auto focus:outline-none sm:text-sm">
              {districts.map((district) => (
                <div
                  key={district.id}
                  className="cursor-pointer select-none relative py-2 pl-3 pr-9 hover:bg-blue-50"
                  onClick={() => {
                    setFormData(prev => ({
                      ...prev,
                      district_id: district.id,
                      schoolDistrict: district.name,
                      // Clear school selection
                      school_id: '',
                      schoolSite: ''
                    }));
                    setDistrictSearch('');
                    setSchools([]);
                    setSchoolSearch('');
                    setShowDistrictDropdown(false);
                  }}
                >
                  {district.name}
                </div>
              ))}
              {districts.length === 200 && (
                <div className="py-2 px-3 text-xs text-gray-500">
                  Showing first 200 results. Type to search for more.
                </div>
              )}
            </div>
          )}
          {showDistrictDropdown && districts.length === 0 && !loadingDistricts && districtSearch && (
            <div className="absolute z-10 mt-1 w-full bg-white shadow-lg rounded-md py-2 px-3 text-sm text-gray-500">
              No districts found
            </div>
          )}
        </div>
        {formData.district_id && (
          <p className="mt-1 text-xs text-green-600">
            ✓ {formData.schoolDistrict} selected
          </p>
        )}
      </div>

      <div className="relative">
        <label
          htmlFor="school"
          className="block text-sm font-medium text-gray-700"
        >
          School Site
        </label>
        <div className="mt-1">
          <input
            id="school"
            type="text"
            required
            value={formData.school_id ? formData.schoolSite : schoolSearch}
            onChange={(e) => {
              setSchoolSearch(e.target.value);
              if (formData.school_id) {
                // Clear selection if user starts typing
                setFormData(prev => ({
                  ...prev,
                  school_id: '',
                  schoolSite: ''
                }));
              }
            }}
            onFocus={() => {
              setShowSchoolDropdown(true);
              if (formData.district_id && !schools.length) {
                loadSchools(formData.district_id);
              }
            }}
            onBlur={(e) => {
              // Delay to allow click on dropdown items
              setTimeout(() => {
                setShowSchoolDropdown(false);
              }, 200);
            }}
            disabled={!formData.district_id || loadingDistricts}
            placeholder={!formData.district_id ? "Select a district first" : "Search for your school..."}
            className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
          />
          {loadingSchools && (
            <div className="absolute right-2 top-2">
              <svg className="animate-spin h-5 w-5 text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            </div>
          )}
          {showSchoolDropdown && schools.length > 0 && (
            <div className="absolute z-10 mt-1 w-full bg-white shadow-lg max-h-60 rounded-md py-1 text-base ring-1 ring-black ring-opacity-5 overflow-auto focus:outline-none sm:text-sm">
              {schools.map((school) => (
                <div
                  key={school.id}
                  className="cursor-pointer select-none relative py-2 pl-3 pr-9 hover:bg-blue-50"
                  onClick={() => {
                    setFormData(prev => ({
                      ...prev,
                      school_id: school.id,
                      schoolSite: school.name
                    }));
                    setSchoolSearch('');
                    setShowSchoolDropdown(false);
                  }}
                >
                  <div>{school.name}</div>
                  {school.school_type && (
                    <div className="text-xs text-gray-500">{school.school_type}</div>
                  )}
                </div>
              ))}
              {schools.length === 500 && (
                <div className="py-2 px-3 text-xs text-gray-500">
                  Showing first 500 results. Type to search for more.
                </div>
              )}
            </div>
          )}
          {showSchoolDropdown && schools.length === 0 && !loadingSchools && schoolSearch && (
            <div className="absolute z-10 mt-1 w-full bg-white shadow-lg rounded-md py-2 px-3 text-sm text-gray-500">
              No schools found
            </div>
          )}
        </div>
        {formData.school_id && (
          <p className="mt-1 text-xs text-green-600">
            ✓ {formData.schoolSite} selected
          </p>
        )}
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
            You&apos;ll be able to set your schedule for each school after signup
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
              I will follow my district&apos;s data retention policies
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