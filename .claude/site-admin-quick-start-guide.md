# Site Admin Quick Start Guide

## Welcome, Sara Harris!

This guide will help you get started with your new Site Admin account for Mt Diablo Elementary School.

---

## 🔐 Your Login Credentials

- **Email:** harrissara@mdusd.org
- **Password:** SaraHarris27!
- **Login URL:** Your Speddy app login page

**First Login:**

1. Go to the login page
2. Enter your email and password
3. You'll be automatically redirected to `/dashboard/admin`

---

## 📊 Understanding Your Dashboard

When you first log in, you'll see:

### Stats Overview

- **Teachers** - Total teacher records at Mt Diablo (currently 31)
- **Specialists** - Resource specialists and service providers
- **Total Staff** - Combined count

### Quick Actions

- **Create New Account** - Add a new teacher
- **View Teacher Directory** - See all teachers
- **Check for Duplicates** - Find and clean up duplicate records

### School Information

- Your school ID and district information
- Your admin role (Site Admin)

---

## 👥 Managing Teachers

### View Teacher Directory

1. Click **"Teachers"** in the navigation bar
2. You'll see a searchable list of all teachers at your school

**What You'll See:**

- Teacher names
- Email addresses (if provided)
- Classroom numbers (if provided)
- Student counts (how many students each teacher has)
- Account status (whether they have portal access)

**Search & Filter:**

- Use the search bar at the top to find teachers by:
  - Name
  - Email
  - Classroom number

### Current State at Mt Diablo Elementary

⚠️ **Your teacher list needs cleanup!** Most records:

- Only have last names (auto-created from old data)
- Missing email addresses
- Missing classroom numbers
- Have duplicates (multiple "Baker", "Mohr", "Grispo", etc.)

---

## 🧹 Cleaning Up Duplicates

### Step 1: Run Duplicate Scan

1. Click **"Duplicates"** in the navigation
2. The system will automatically scan for similar names
3. You'll see groups of potential duplicates

### What You'll Find

The system will likely show ~9 groups:

- **Baker** (2 records)
- **Blazer** (2 records)
- **Brown** (2 records)
- **Chavez** (2 records)
- **Grispo** (2 records - one is Aimee with a portal account)
- **Mohr** (3 records!)
- **Osterkamp** (2 records)
- **Sansoe** (2 records)
- **Ills/Ils** (probably a typo)

### Step 2: Review Each Group

For each duplicate group:

**Check:**

- Which record has the most complete information?
- Which record has students assigned?
- Which record has an account (green "Active" badge)?

**Recommendation:**

- ✅ **Keep** the record with:
  - The most complete information (name, email, classroom)
  - An active account (if any)
  - Student assignments
- ❌ **Delete** records that are:
  - Empty or incomplete
  - Have no students assigned
  - Have no active account

### Step 3: Delete Duplicates

1. Click **"Delete"** button next to the record you want to remove
2. Confirm the deletion
3. Records with active accounts **cannot** be deleted (safety feature)

**Example: Grispo Duplicates**

- Record 1: "Aimee Grispo" with email grispoa@mdusd.org (has account)
- Record 2: "Grispo" with no first name, 2 students assigned

**Action:** Keep Aimee's record (has account), but note she has 0 students while the duplicate has 2. You may want to reassign those students to her full record.

---

## ➕ Creating New Teacher Accounts

### When to Create a New Teacher

- New teacher starts at your school
- You need to add complete information for an existing teacher
- You want to create a teacher before students are enrolled

### How to Create

1. Click **"Create Account"** from dashboard or navigation
2. Select **"Teacher"** account type
3. Fill in the form:

**Required:**

- First Name
- Last Name

**Optional but Recommended:**

- Email (for future portal access)
- Classroom Number (e.g., "Room 101")
- Phone Number

### Duplicate Warning

The system will check for similar names and warn you if it finds matches. For example:

- You try to create "John Smith"
- System finds existing "J. Smith" or "Smith"
- You'll see a yellow warning box

**What to Do:**

- If it's the same person, cancel and use the existing record
- If it's a different person, you can proceed

### Important Notes

⚠️ **MVP Limitations:**

- Teacher accounts are created without login credentials
- Email invites not yet available
- Teachers cannot self-register yet
- You can link teachers to portal accounts later

---

## 🎯 Recommended First Steps

### Day 1: Familiarize Yourself

1. Log in and explore the dashboard
2. Browse the teacher directory
3. Run the duplicate scan to see what needs cleanup

### Week 1: Clean Up Duplicates

1. Start with obvious duplicates (multiple "Mohr", "Baker", etc.)
2. Delete empty records with no students
3. Keep records that have student assignments

### Week 2: Complete Teacher Information

1. For remaining teachers, add missing information:
   - First names
   - Email addresses
   - Classroom numbers
2. Create new teacher accounts with complete information
3. Consider reaching out to teachers for their email addresses

### Ongoing: Maintain Directory

- Create new teachers when they join your school
- Update contact information as needed
- Review for duplicates monthly

---

## 💡 Tips & Best Practices

### Searching for Teachers

- Search by last name to find all variations
- Use classroom number if you know it
- Email search works even with partial addresses

### Preventing Duplicates

- Always search before creating a new teacher
- Pay attention to duplicate warnings
- Use consistent naming (First Last, not Last, First)

### When You Can't Delete

If a teacher has an **Active** account badge, you cannot delete them. This is a safety feature. Options:

- Keep the record
- Contact system admin to unlink the account first
- Use this as the primary record going forward

### Working with Specialists

Resource specialists at your school will also see the same teacher directory. Any teachers you create or update will be visible to them as well.

---

## 🆘 Common Questions

### Q: Why are there so many duplicate teachers?

**A:** The old system let each resource specialist create their own teacher list using free-text entry. This led to duplicates and inconsistent naming.

### Q: What happens to students when I delete a teacher?

**A:** Students are not deleted. They just won't have a teacher assigned anymore. You'll need to reassign them to the correct teacher record.

### Q: Can teachers log in and see their students?

**A:** Teachers with accounts (role='teacher') can log in to see their students in resource services. Aimee Grispo has this access.

### Q: Can I undo a deletion?

**A:** No, deletions are permanent. Only delete records you're sure are duplicates with no valuable information.

### Q: How do I give a teacher portal access?

**A:** This feature is coming soon. For now, teacher accounts are created without login credentials. Email invites will be available in a future update.

### Q: Can I create resource specialist accounts?

**A:** Not yet in this version. The "Specialist" button exists but isn't functional in MVP. Contact system admin for specialist accounts.

---

## 📞 Need Help?

If you run into issues:

1. Check the troubleshooting section in the main documentation
2. Contact your system administrator
3. Report bugs via GitHub issues

---

## 🎉 You're Ready!

You now have the tools to:

- ✅ View all teachers at Mt Diablo Elementary
- ✅ Clean up duplicate teacher records
- ✅ Create new teacher accounts with complete information
- ✅ Maintain a clean, organized teacher directory

**Your first login URL:** Go to your Speddy app and log in with harrissara@mdusd.org

Good luck, and thanks for helping keep our teacher directory clean and organized!

---

_Last Updated: November 12, 2025_
_For technical documentation, see: .claude/site-admin-implementation.md_
