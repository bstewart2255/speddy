/**
 * Unit tests for the unified-import client-side file detection (SPE-231).
 * Pins that each real fixture shape routes to the correct type/form key without
 * the user naming it.
 */

import {
  classifyImportFile,
  detectImportFile,
  normalizeHeaderCells,
  fileExtension,
  IMPORT_TYPE_META,
} from '@/lib/import/detect-import-file';

// Real header rows (mirroring the golden fixtures).
const DELIVERIES_HEADER =
  'Name,SEIS ID,Service,Delivery,Start Date,End Date,Sessions / Frequency,Location,Total Minutes (min/year),Total Delivered,Medi-Cal Billing Consent';
const ROSTER_HEADER = 'Initials,Grade,Teacher,Sessions Per Week,Minutes Per Session';
const SEIS_GOALS_HEADER =
  'SEIS ID,District ID,Last Name,First Name,Birthdate,Grade,School of Attendance,District of Service,Case Manager,IEP Date';
const GENERIC_HEADER = 'Student ID,First Name,Last Name,Grade,Goal';

describe('fileExtension', () => {
  it('returns the lowercased extension', () => {
    expect(fileExtension('Report.XLSX')).toBe('xlsx');
    expect(fileExtension('a.b.csv')).toBe('csv');
    expect(fileExtension('noext')).toBe('');
  });
});

describe('classifyImportFile', () => {
  it('routes Aeries .txt to class-list by extension', () => {
    expect(classifyImportFile('ClassList.txt')).toBe('class-list');
  });

  it('routes SEIS .xlsx/.xls to seis-report by extension', () => {
    expect(classifyImportFile('StudentGoals.xlsx')).toBe('seis-report');
    expect(classifyImportFile('StudentGoals.xls')).toBe('seis-report');
  });

  it('routes a Deliveries CSV by its "Sessions / Frequency" column', () => {
    expect(classifyImportFile('Deliveries.csv', DELIVERIES_HEADER)).toBe('deliveries');
  });

  it('routes a roster-template CSV by Initials + Grade + Teacher columns', () => {
    expect(classifyImportFile('Students_Template.csv', ROSTER_HEADER)).toBe('roster-template');
  });

  it('routes a SEIS Student Goals CSV to seis-report', () => {
    expect(classifyImportFile('StudentGoals.csv', SEIS_GOALS_HEADER)).toBe('seis-report');
  });

  it('routes any other CSV to seis-report (the server validates the rest)', () => {
    expect(classifyImportFile('generic.csv', GENERIC_HEADER)).toBe('seis-report');
  });

  it('handles a UTF-8 BOM and quoted header cells (as SEIS exports ship)', () => {
    const bomQuoted = '﻿"SEIS ID","District ID","Last Name","First Name","Birthdate","Grade"';
    expect(classifyImportFile('StudentGoals.csv', bomQuoted)).toBe('seis-report');
    const bomDeliveries = '﻿Name,SEIS ID,Service,Delivery,Start Date,End Date,Sessions / Frequency';
    expect(classifyImportFile('d.csv', bomDeliveries)).toBe('deliveries');
  });

  it('does not mistake a partial roster header for a roster', () => {
    // Only "Grade" present — not all three of initials/grade/teacher.
    expect(classifyImportFile('x.csv', 'Grade,Goal,Notes')).toBe('seis-report');
  });

  it('returns unknown for unaccepted extensions', () => {
    expect(classifyImportFile('ParentLetter.docx')).toBe('unknown');
    expect(classifyImportFile('photo.png')).toBe('unknown');
    expect(classifyImportFile('notes.pdf')).toBe('unknown');
  });
});

describe('IMPORT_TYPE_META form keys', () => {
  it('maps the three server-backed types to their form keys', () => {
    expect(IMPORT_TYPE_META['seis-report'].formKey).toBe('studentsFile');
    expect(IMPORT_TYPE_META.deliveries.formKey).toBe('deliveriesFile');
    expect(IMPORT_TYPE_META['class-list'].formKey).toBe('classListFile');
  });

  it('maps the roster template to the students file (SPE-225); only unknown has no key', () => {
    expect(IMPORT_TYPE_META['roster-template'].formKey).toBe('studentsFile');
    expect(IMPORT_TYPE_META.unknown.formKey).toBeNull();
  });
});

describe('normalizeHeaderCells', () => {
  it('collapses whitespace and lowercases', () => {
    expect(normalizeHeaderCells('Sessions  /  Frequency,  Grade ')).toEqual(['sessions / frequency', 'grade']);
  });
});

describe('detectImportFile (reads the CSV header chunk)', () => {
  it('detects a Deliveries CSV from a File without reading the whole file', async () => {
    const file = new File([`${DELIVERIES_HEADER}\n"Alvarez, Ana",2000001,330,Direct`], 'export.csv', {
      type: 'text/csv',
    });
    expect(await detectImportFile(file)).toBe('deliveries');
  });

  it('detects a roster template File', async () => {
    const file = new File([`${ROSTER_HEADER}\nJD,3,Smith,2,30`], 'roster.csv', { type: 'text/csv' });
    expect(await detectImportFile(file)).toBe('roster-template');
  });

  it('detects a class list by extension without reading content', async () => {
    const file = new File(['irrelevant content'], 'ClassList.txt', { type: 'text/plain' });
    expect(await detectImportFile(file)).toBe('class-list');
  });
});
