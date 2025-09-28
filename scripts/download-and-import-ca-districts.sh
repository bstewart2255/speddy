#!/bin/bash

# Script to download and import California districts and schools from NCES CCD data
# This uses the official NCES data files which are more reliable than APIs

echo "📥 Downloading NCES Common Core Data files..."

# Create data directory
mkdir -p data/nces

# Download the 2022-23 LEA (district) data
echo "Downloading district data..."
curl -o data/nces/ccd_lea_2022.csv "https://nces.ed.gov/ccd/Data/zip/ccd_lea_029_2223_csv.zip"
unzip -o data/nces/ccd_lea_2022.csv -d data/nces/

# Download the 2022-23 School data
echo "Downloading school data..."
curl -o data/nces/ccd_sch_2022.csv "https://nces.ed.gov/ccd/Data/zip/ccd_sch_029_2223_csv.zip"
unzip -o data/nces/ccd_sch_2022.csv -d data/nces/

echo "✅ Data files downloaded"
echo ""
echo "Now run: npm run import:ca-from-files"
echo ""
echo "This will import all California districts and elementary schools from the downloaded NCES data."