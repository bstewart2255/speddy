#!/bin/bash

# Referral Code Test Runner Script
# This script runs all referral code related tests and generates a report

echo "🧪 Starting Referral Code Test Suite..."
echo "========================================"

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if required environment variables are set
check_env() {
    if [ -z "$NEXT_PUBLIC_SUPABASE_URL" ] || [ -z "$SUPABASE_SERVICE_ROLE_KEY" ]; then
        echo -e "${RED}❌ Missing required environment variables${NC}"
        echo "Please ensure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set"
        exit 1
    fi
}

# Run integration tests
run_integration_tests() {
    echo -e "\n${YELLOW}Running Integration Tests...${NC}"
    npm run test:integration -- __tests__/integration/referral-codes.test.ts
    INTEGRATION_EXIT_CODE=$?

    if [ $INTEGRATION_EXIT_CODE -eq 0 ]; then
        echo -e "${GREEN}✅ Integration tests passed${NC}"
    else
        echo -e "${RED}❌ Integration tests failed${NC}"
    fi

    return $INTEGRATION_EXIT_CODE
}

# Generate test report
generate_report() {
    echo -e "\n${YELLOW}Generating Test Report...${NC}"

    REPORT_FILE="referral-code-test-report-$(date +%Y%m%d-%H%M%S).txt"

    cat > "$REPORT_FILE" << EOF
Referral Code Test Report
Generated: $(date)
========================

Environment:
- NEXT_PUBLIC_SUPABASE_URL: ${NEXT_PUBLIC_SUPABASE_URL}
- NODE_ENV: ${NODE_ENV:-development}

Test Results:
- Integration Tests: $([ $1 -eq 0 ] && echo "PASSED" || echo "FAILED")

Test Coverage Areas:
✓ Teacher role automatic code generation
✓ SEA role exclusion from codes
✓ Code uniqueness verification
✓ Code format validation (6 chars, uppercase alphanumeric)
✓ API validation endpoint
✓ Dashboard UI display
✓ Billing page display
✓ Copy functionality
✓ Referral statistics

EOF

    echo -e "${GREEN}📄 Report saved to: $REPORT_FILE${NC}"
}

# Main execution
main() {
    check_env

    # Run tests
    run_integration_tests
    INTEGRATION_RESULT=$?

    # Generate report
    generate_report $INTEGRATION_RESULT

    # Final summary
    echo -e "\n========================================"
    echo "📊 Test Summary:"
    echo "========================================"

    if [ $INTEGRATION_RESULT -eq 0 ]; then
        echo -e "${GREEN}🎉 All tests passed!${NC}"
        exit 0
    else
        echo -e "${RED}❌ Some tests failed. Please check the logs above.${NC}"
        exit 1
    fi
}

# Run the script
main
