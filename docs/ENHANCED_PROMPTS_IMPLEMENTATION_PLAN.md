# Enhanced Prompts Implementation Plan

## Overview

This document outlines the step-by-step implementation plan for integrating the enhanced prompt system (documented in ENHANCED_LESSON_PROMPTS.md) across all 3 AI lesson generation entry points.

## Current State Analysis

### Enhanced Prompt System Status: ✅ Ready

- Complete documentation in `/docs/ENHANCED_LESSON_PROMPTS.md`
- 2-section structure (Introduction, Activity)
- Subject type differentiation (ELA vs Math)
- Standardized question types and formatting rules
- Grade-based blank line rules

### Current Implementation Gaps: ❌ Needs Work

- Missing `subjectType: 'ela' | 'math'` field collection
- Using 3-section structure instead of 2-section
- No standardized question type enforcement
- No grade-based formatting rules

## Implementation Strategy

### Phase 1: Core Infrastructure Updates 🔧

**Goal**: Update schemas and core prompt system to support enhanced approach

#### Step 1.1: Update LessonRequest Schema

**File**: `/lib/lessons/schema.ts`

- [ ] Add `subjectType: 'ela' | 'math'` to LessonRequest interface
- [ ] Update validation to require subjectType

#### Step 1.2: Replace Current PromptBuilder

**File**: `/lib/lessons/prompts.ts`

- [ ] Replace with enhanced prompt system from documentation
- [ ] Update buildSystemPrompt() to accept subjectType parameter
- [ ] Update buildUserPrompt() to handle new requirements
- [ ] Add helper functions (getActivityItemCount, getBlankLineCount, etc.)

#### Step 1.3: Update API Route Handler

**File**: `/app/api/lessons/generate/route.ts`

- [ ] Update to pass subjectType to prompt builder
- [ ] Ensure proper error handling for missing subjectType
- [ ] Update logging to include subject type information

### Phase 2: Entry Point #3 - AI Lesson Builder (Primary) 🎯

**Goal**: Implement full enhanced prompt system in the most flexible entry point first

#### Step 2.1: Update Lesson Builder UI

**File**: `/app/(dashboard)/dashboard/lessons/components/lesson-builder.tsx`

- [ ] Add subject type selection dropdown (ELA vs Math)
- [ ] Position prominently near top of form
- [ ] Make it required field with validation
- [ ] Update form state management to include subjectType

#### Step 2.2: Update Lesson Builder API Calls

- [ ] Include subjectType in lesson generation requests
- [ ] Update error handling for new required field
- [ ] Test with both ELA and Math lesson types

#### Step 2.3: Test Enhanced Prompts

- [ ] Generate ELA lesson and verify 2-section structure
- [ ] Generate Math lesson and verify subject-specific formatting
- [ ] Validate question types match enhanced standards
- [ ] Confirm grade-based blank line rules work correctly

### Phase 3: Entry Point - Calendar Week View 📊

**Goal**: Add subject type selection via popup before AI generation

#### Step 3.1: Update Calendar Lesson Creation Flow

**File**: `/app/components/calendar/calendar-week-view.tsx`

- [ ] Create subject type selection popup
- [ ] Trigger popup after user selects "Create AI Lesson Plan" in LessonTypeModal
- [ ] Update lesson generation flow: Choose AI → Choose Subject (popup) → Generate
- [ ] Pass subjectType through to lesson generation API calls

#### Step 3.2: Enhance Lesson Type Modal Flow

**File**: `/app/components/modals/lesson-type-modal.tsx`

- [ ] Keep existing modal simple (AI vs Manual choice only)
- [ ] Trigger subject type popup when AI option is selected
- [ ] Modal flow: Click "+ Create Lesson" → Choose AI/Manual → [If AI] Choose Math/ELA (popup) → Generate

### Phase 4: Testing & Validation ✅

**Goal**: Comprehensive testing across all entry points

#### Step 4.1: Automated Testing

- [ ] Create test cases for all entry points with both ELA and Math
- [ ] Validate JSON structure matches enhanced schema
- [ ] Test grade-based formatting rules
- [ ] Verify standardized question types are enforced

#### Step 4.2: User Acceptance Testing

- [ ] Test lesson generation from calendar
- [ ] Test lesson generation from lesson builder
- [ ] Validate lesson quality improvements

#### Step 4.3: Performance Testing

- [ ] Measure response times with enhanced prompts
- [ ] Test with various student group sizes
- [ ] Validate memory usage and API performance

### Phase 5: Documentation & Training 📚

**Goal**: Update documentation and prepare for user adoption

#### Step 5.1: Update Technical Documentation

- [ ] Update API documentation with subjectType requirements
- [ ] Document new prompt system capabilities
- [ ] Create troubleshooting guide for common issues

#### Step 5.2: Create User-Facing Documentation

- [ ] Document subject type selection process for users
- [ ] Explain improved lesson formatting benefits
- [ ] Create quick-start guide for enhanced features

## Implementation Timeline

### Week 1: Core Infrastructure (Phase 1)

- Update schemas, prompt builder, and API route
- Create comprehensive test suite for new prompt system

### Week 2: AI Lesson Builder (Phase 2)

- Implement enhanced prompts in primary entry point
- Test and validate enhanced lesson generation

### Week 3: Calendar Integration (Phase 3)

- Add subject type selection to remaining entry points
- Ensure consistent UX across all generation methods

### Week 4: Testing & Polish (Phases 4-5)

- Comprehensive testing and bug fixes
- Documentation updates and user training materials

## Risk Mitigation

### User Experience

- [ ] Make subject type selection intuitive and fast
- [ ] Provide clear feedback during lesson generation
- [ ] Ensure enhanced lessons load and display properly

### Performance

- [ ] Monitor API response times with enhanced prompts
- [ ] Optimize prompt size if necessary
- [ ] Implement proper error handling and timeouts

## Success Criteria

### Technical Goals

- [ ] All 3 entry points successfully generate lessons with enhanced prompts
- [ ] Generated lessons follow 2-section structure consistently
- [ ] Subject-specific formatting (ELA vs Math) works correctly
- [ ] Grade-based rules are properly applied

### Quality Goals

- [ ] Lessons have substantially improved structure and consistency
- [ ] Content is more targeted and pedagogically sound
- [ ] Teachers report improved lesson usability

### User Experience Goals

- [ ] Subject type selection is intuitive and quick
- [ ] Generation time remains acceptable (< 30 seconds)
- [ ] Error handling provides clear, actionable feedback

## Next Steps

1. **Review and Approve Plan**: Team review of this implementation plan
2. **Begin Phase 1**: Start with core infrastructure updates
3. **Set Up Testing Environment**: Prepare comprehensive test cases
4. **Regular Check-ins**: Weekly progress reviews against this plan

---

**Document Status**: Draft  
**Created**: 2025-09-10  
**Last Updated**: 2025-09-10  
**Owner**: Development Team
