"use client";

import { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardBody } from "../ui/card";
import { Button } from "../ui/button";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { CollapsibleCard } from "../ui/collapsible-card";

// Common special education curriculums used in US elementary schools
const CURRICULUM_OPTIONS = [
  // Reading/Literacy Programs
  { id: "wilson-reading", name: "Wilson Reading System", category: "Reading" },
  { id: "orton-gillingham", name: "Orton-Gillingham", category: "Reading" },
  { id: "lindamood-bell", name: "Lindamood-Bell", category: "Reading" },
  { id: "reading-mastery", name: "Reading Mastery", category: "Reading" },
  { id: "corrective-reading", name: "Corrective Reading", category: "Reading" },
  { id: "rewards", name: "REWARDS", category: "Reading" },
  { id: "spire", name: "S.P.I.R.E.", category: "Reading" },
  { id: "phonics-first", name: "Phonics First", category: "Reading" },
  { id: "fundations", name: "Fundations", category: "Reading" },
  { id: "raz-kids", name: "Raz-Kids", category: "Reading" },
  { id: "lexia-core5", name: "Lexia Core5", category: "Reading" },

  // Math Programs
  { id: "touch-math", name: "TouchMath", category: "Math" },
  { id: "math-u-see", name: "Math-U-See", category: "Math" },
  { id: "saxon-math", name: "Saxon Math", category: "Math" },
  { id: "singapore-math", name: "Singapore Math", category: "Math" },
  { id: "enumeracy", name: "Do The Math", category: "Math" },
  { id: "number-worlds", name: "Number Worlds", category: "Math" },
  { id: "connecting-math", name: "Connecting Math Concepts", category: "Math" },

  // Writing Programs
  {
    id: "handwriting-without-tears",
    name: "Handwriting Without Tears",
    category: "Writing",
  },
  { id: "step-up-to-writing", name: "Step Up to Writing", category: "Writing" },

  // Social Skills/Behavior
  { id: "social-thinking", name: "Social Thinking", category: "Social Skills" },
  {
    id: "zones-of-regulation",
    name: "Zones of Regulation",
    category: "Social Skills",
  },
  { id: "second-step", name: "Second Step", category: "Social Skills" },
  { id: "superflex", name: "Superflex", category: "Social Skills" },

  // Multi-Sensory/General
  {
    id: "unique-learning",
    name: "Unique Learning System",
    category: "General",
  },
  { id: "edmark", name: "Edmark Reading Program", category: "General" },
  { id: "teachtown", name: "TeachTown", category: "General" },
];

export function CurriculumsSettings() {
  const [selectedCurriculums, setSelectedCurriculums] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const supabase = createClientComponentClient();

  useEffect(() => {
    loadCurriculums();
  }, []);

  const loadCurriculums = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select("selected_curriculums")
        .eq("id", user.id)
        .single();

      if (profile?.selected_curriculums) {
        setSelectedCurriculums(profile.selected_curriculums);
      }
    } catch (error) {
      console.error("Error loading curriculums:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleCurriculum = (curriculumId: string) => {
    setSelectedCurriculums((prev) => {
      if (prev.includes(curriculumId)) {
        return prev.filter((id) => id !== curriculumId);
      } else {
        return [...prev, curriculumId];
      }
    });
  };

  const saveCurriculums = async () => {
    setSaving(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase
        .from("profiles")
        .update({ selected_curriculums: selectedCurriculums })
        .eq("id", user.id);

      if (error) throw error;

      alert("Curriculums saved successfully!");
    } catch (error) {
      console.error("Error saving curriculums:", error);
      alert("Failed to save curriculums. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardBody>
          <div className="text-center py-4">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-2 text-gray-600">Loading curriculums...</p>
          </div>
        </CardBody>
      </Card>
    );
  }

  // Group curriculums by category
  const curriculumsByCategory = CURRICULUM_OPTIONS.reduce(
    (acc, curr) => {
      if (!acc[curr.category]) {
        acc[curr.category] = [];
      }
      acc[curr.category].push(curr);
      return acc;
    },
    {} as Record<string, typeof CURRICULUM_OPTIONS>,
  );

  return (
    <CollapsibleCard title="District Curriculums" defaultOpen={false}>
      <div className="space-y-6">
        <p className="text-sm text-gray-600">
          Select the curriculums used at your district for special education
          programs. This helps the AI generate lesson materials in line with the curriculums you use.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {Object.entries(curriculumsByCategory).map(
            ([category, curriculums]) => (
              <div key={category} className="space-y-3">
                <h4 className="font-medium text-gray-900 text-sm uppercase tracking-wider">
                  {category}
                </h4>
                <div className="space-y-1">
                  {curriculums.map((curriculum) => (
                    <label
                      key={curriculum.id}
                      className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 p-2 rounded text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={selectedCurriculums.includes(curriculum.id)}
                        onChange={() => handleToggleCurriculum(curriculum.id)}
                        className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 focus:ring-2"
                      />
                      <span className="text-gray-700">{curriculum.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            ),
          )}
        </div>

        <div className="flex justify-end pt-4 border-t">
          <Button onClick={saveCurriculums} disabled={saving}>
            {saving ? "Saving..." : "Save Curriculums"}
          </Button>
        </div>
      </div>
    </CollapsibleCard>
  );
}
