import React from 'react'
import { act, render, screen, waitFor, userEvent } from '../../../test-utils'
import CreateAccountPage from '@/app/(dashboard)/dashboard/admin/create-account/page'

const mockPush = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, refresh: jest.fn(), replace: jest.fn() }),
}))

jest.mock('next/link', () => {
  const MockLink = ({ children, href, ...rest }: any) => (
    <a href={href} {...rest}>
      {children}
    </a>
  )
  MockLink.displayName = 'MockLink'
  return MockLink
})

const mockGetCurrentAdminPermissions = jest.fn()
const mockGetDistrictSchools = jest.fn()
const mockCheckDuplicateTeachers = jest.fn()
const mockGetCurrentUserSchoolId = jest.fn()

jest.mock('@/lib/supabase/queries/admin-accounts', () => ({
  getCurrentAdminPermissions: (...args: any[]) => mockGetCurrentAdminPermissions(...args),
  getDistrictSchools: (...args: any[]) => mockGetDistrictSchools(...args),
  checkDuplicateTeachers: (...args: any[]) => mockCheckDuplicateTeachers(...args),
}))

jest.mock('@/lib/supabase/queries/school-directory', () => ({
  getCurrentUserSchoolId: (...args: any[]) => mockGetCurrentUserSchoolId(...args),
}))

const DISTRICT_ADMIN = [{ role: 'district_admin', district_id: 'district-1', school_id: null }]
const SITE_ADMIN = [{ role: 'site_admin', district_id: null, school_id: 'school-a' }]

const DISTRICT_SCHOOLS = [
  { id: 'school-a', name: 'Alpha Elementary' },
  { id: 'school-b', name: 'Bravo Elementary' },
]

/** Waits for the mount-time permission check to settle before asserting. */
const renderPage = async () => {
  const result = render(<CreateAccountPage />)
  await waitFor(() => expect(mockGetCurrentAdminPermissions).toHaveBeenCalled())
  return result
}

describe('Admin Create New Account page', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockGetDistrictSchools.mockResolvedValue(DISTRICT_SCHOOLS)
    mockCheckDuplicateTeachers.mockResolvedValue([])
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ credentials: { email: 'new@school.edu', temporaryPassword: 'temp-pass' } }),
    })
  })

  describe('district admin', () => {
    beforeEach(() => {
      mockGetCurrentAdminPermissions.mockResolvedValue(DISTRICT_ADMIN)
      // District admins have no school of their own.
      mockGetCurrentUserSchoolId.mockResolvedValue(null)
    })

    it('sends Cancel to the admin dashboard, not the school-scoped teacher directory', async () => {
      await renderPage()

      await waitFor(() => {
        expect(screen.getByRole('link', { name: 'Cancel' })).toHaveAttribute('href', '/dashboard/admin')
      })
    })

    it('offers a school picker for teachers and creates via the district endpoint', async () => {
      const user = userEvent.setup()
      await renderPage()

      const schoolSelect = await screen.findByLabelText(/school/i)
      await user.type(screen.getByLabelText(/first name/i), 'Jane')
      await user.type(screen.getByLabelText(/last name/i), 'Doe')
      await user.type(screen.getByLabelText(/email/i), 'jane.doe@school.edu')
      await user.selectOptions(schoolSelect, 'school-b')
      await user.click(screen.getByRole('button', { name: /create account/i }))

      await waitFor(() => expect(global.fetch).toHaveBeenCalled())

      const [url, init] = (global.fetch as jest.Mock).mock.calls[0]
      expect(url).toBe('/api/admin/district/teachers')
      expect(JSON.parse(init.body)).toMatchObject({
        first_name: 'Jane',
        last_name: 'Doe',
        email: 'jane.doe@school.edu',
        school_id: 'school-b',
      })
    })

    it('asks for a school instead of submitting when none is picked', async () => {
      // With no schools to pick from there is no required <select> to block
      // submission, so this exercises the guard in handleSubmit rather than
      // HTML5 validation.
      mockGetDistrictSchools.mockResolvedValue([])
      const user = userEvent.setup()
      await renderPage()

      await screen.findByText(/no schools found in your district/i)
      await user.type(screen.getByLabelText(/first name/i), 'Jane')
      await user.type(screen.getByLabelText(/last name/i), 'Doe')
      await user.type(screen.getByLabelText(/email/i), 'jane.doe@school.edu')
      await user.click(screen.getByRole('button', { name: /create account/i }))

      expect(await screen.findByText(/select the school this teacher works at/i)).toBeInTheDocument()
      expect(global.fetch).not.toHaveBeenCalled()
    })

    it('does not show an error when the name is blurred before a school is picked', async () => {
      const user = userEvent.setup()
      await renderPage()

      await user.type(screen.getByLabelText(/first name/i), 'Jane')
      await user.type(screen.getByLabelText(/last name/i), 'Doe')
      await user.tab()

      await waitFor(() => expect(mockGetCurrentAdminPermissions).toHaveBeenCalled())
      expect(screen.queryByText(/could not determine your school/i)).not.toBeInTheDocument()
      expect(mockCheckDuplicateTeachers).not.toHaveBeenCalled()
    })
  })

  it('blocks submission until the permission lookup settles', async () => {
    // Until we know the admin's scope we can't tell which endpoint to post to,
    // so a district admin submitting early would take the site-admin branch.
    let resolvePerms: (v: unknown) => void = () => {}
    mockGetCurrentAdminPermissions.mockReturnValue(
      new Promise(resolve => { resolvePerms = resolve })
    )
    const user = userEvent.setup()
    render(<CreateAccountPage />)

    const submit = screen.getByRole('button', { name: /create account/i })
    expect(submit).toBeDisabled()

    await user.type(screen.getByLabelText(/first name/i), 'Jane')
    await user.type(screen.getByLabelText(/last name/i), 'Doe')
    await user.type(screen.getByLabelText(/email/i), 'jane.doe@school.edu')
    await user.click(submit)
    expect(global.fetch).not.toHaveBeenCalled()

    resolvePerms(DISTRICT_ADMIN)
    await waitFor(() => expect(submit).toBeEnabled())
    // ...and now it knows to demand a school.
    expect(await screen.findByLabelText(/school/i)).toBeInTheDocument()
  })

  it('ignores a duplicate-check response that a newer check superseded', async () => {
    mockGetCurrentAdminPermissions.mockResolvedValue(DISTRICT_ADMIN)
    let resolveAlpha: (v: unknown) => void = () => {}
    mockCheckDuplicateTeachers
      // Alpha's check hangs; Bravo's answers straight away and wins.
      .mockImplementationOnce(() => new Promise(resolve => { resolveAlpha = resolve }))
      .mockResolvedValue([{ first_name: 'Jane', last_name: 'Bravomatch', classroom_number: '9' }])

    const user = userEvent.setup()
    await renderPage()
    const schoolSelect = await screen.findByLabelText(/school/i)

    await user.type(screen.getByLabelText(/first name/i), 'Jane')
    await user.type(screen.getByLabelText(/last name/i), 'Doe')
    await user.selectOptions(schoolSelect, 'school-a')
    await user.selectOptions(schoolSelect, 'school-b')

    expect(await screen.findByText(/Bravomatch/)).toBeInTheDocument()

    // The stale Alpha result lands last. It must not replace the warning for
    // the school the admin is actually creating at.
    await act(async () => {
      resolveAlpha([{ first_name: 'Jane', last_name: 'Alphamatch', classroom_number: '3' }])
      await new Promise(resolve => setTimeout(resolve, 0))
    })

    expect(screen.queryByText(/Alphamatch/)).not.toBeInTheDocument()
    expect(screen.getByText(/Bravomatch/)).toBeInTheDocument()
  })

  it('keeps Cancel on the dashboard when the permission check fails', async () => {
    mockGetCurrentAdminPermissions.mockRejectedValue(new Error('network'))
    await renderPage()

    // We can't prove the admin has a school, so don't gamble on the
    // school-scoped directory loading.
    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'Cancel' })).toHaveAttribute('href', '/dashboard/admin')
    })
  })

  describe('site admin', () => {
    beforeEach(() => {
      mockGetCurrentAdminPermissions.mockResolvedValue(SITE_ADMIN)
      mockGetCurrentUserSchoolId.mockResolvedValue('school-a')
    })

    it('keeps Cancel pointed at the teacher directory', async () => {
      await renderPage()

      await waitFor(() => {
        expect(screen.getByRole('link', { name: 'Cancel' })).toHaveAttribute(
          'href',
          '/dashboard/admin/teachers'
        )
      })
    })

    it('creates teachers at their own school without a picker', async () => {
      const user = userEvent.setup()
      await renderPage()

      await waitFor(() => {
        expect(screen.getByRole('link', { name: 'Cancel' })).toHaveAttribute(
          'href',
          '/dashboard/admin/teachers'
        )
      })
      expect(screen.queryByLabelText(/^school/i)).not.toBeInTheDocument()

      await user.type(screen.getByLabelText(/first name/i), 'Jane')
      await user.type(screen.getByLabelText(/last name/i), 'Doe')
      await user.type(screen.getByLabelText(/email/i), 'jane.doe@school.edu')
      await user.click(screen.getByRole('button', { name: /create account/i }))

      await waitFor(() => expect(global.fetch).toHaveBeenCalled())

      const [url, init] = (global.fetch as jest.Mock).mock.calls[0]
      expect(url).toBe('/api/admin/create-teacher-account')
      expect(JSON.parse(init.body)).toMatchObject({ school_id: 'school-a' })
    })
  })
})
