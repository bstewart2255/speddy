import { log, debug } from '@/lib/monitoring/logger'

describe('Logger', () => {
  let consoleErrorSpy: jest.SpyInstance
  let consoleLogSpy: jest.SpyInstance
  let consoleWarnSpy: jest.SpyInstance
  let consoleTimeSpy: jest.SpyInstance
  let consoleTimeEndSpy: jest.SpyInstance
  let consoleGroupSpy: jest.SpyInstance
  let consoleTableSpy: jest.SpyInstance
  let consoleGroupEndSpy: jest.SpyInstance

  beforeEach(() => {
    jest.clearAllMocks()
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation()
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation()
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation()
    consoleTimeSpy = jest.spyOn(console, 'time').mockImplementation()
    consoleTimeEndSpy = jest.spyOn(console, 'timeEnd').mockImplementation()
    consoleGroupSpy = jest.spyOn(console, 'group').mockImplementation()
    consoleTableSpy = jest.spyOn(console, 'table').mockImplementation()
    consoleGroupEndSpy = jest.spyOn(console, 'groupEnd').mockImplementation()
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  describe('log.error', () => {
    it('logs error with message and error object', () => {
      const error = new Error('Test error')
      const context = { userId: 'user123', school: 'Test School' }
      
      log.error('An error occurred', error, context)
      
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          level: 'error',
          message: 'An error occurred',
          error: 'Test error',
          stack: error.stack,
          context,
          userId: 'user123',
          school: 'Test School',
          timestamp: expect.any(String),
        })
      )
    })

    it('handles non-Error objects', () => {
      const error = 'String error'
      
      log.error('An error occurred', error)
      
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          level: 'error',
          message: 'An error occurred',
          error: 'String error',
          stack: undefined,
        })
      )
    })
  })

  describe('log.info', () => {
    it('logs info in development environment', () => {
      const originalEnv = process.env.NODE_ENV
      process.env.NODE_ENV = 'development'
      
      log.info('Info message', { data: 'test' })
      
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          level: 'info',
          message: 'Info message',
          data: { data: 'test' },
          timestamp: expect.any(String),
        })
      )
      
      process.env.NODE_ENV = originalEnv
    })

    it('does not log info in production environment', () => {
      const originalEnv = process.env.NODE_ENV
      process.env.NODE_ENV = 'production'
      
      log.info('Info message', { data: 'test' })
      
      expect(consoleLogSpy).not.toHaveBeenCalled()
      
      process.env.NODE_ENV = originalEnv
    })
  })

  describe('log.warn', () => {
    it('logs warning messages', () => {
      log.warn('Warning message', { data: 'test' })
      
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          level: 'warn',
          message: 'Warning message',
          data: { data: 'test' },
          timestamp: expect.any(String),
        })
      )
    })
  })

  describe('debug utilities', () => {
    const originalEnv = process.env.NODE_ENV

    beforeEach(() => {
      process.env.NODE_ENV = 'development'
    })

    afterEach(() => {
      process.env.NODE_ENV = originalEnv
    })

    it('debug.table logs table in development', () => {
      const data = [{ id: 1, name: 'Test' }]
      
      debug.table('Test Data', data)
      
      expect(consoleGroupSpy).toHaveBeenCalledWith('🔍 Test Data')
      expect(consoleTableSpy).toHaveBeenCalledWith(data)
      expect(consoleGroupEndSpy).toHaveBeenCalled()
    })

    it('debug.time starts timer in development', () => {
      debug.time('Test Timer')
      
      expect(consoleTimeSpy).toHaveBeenCalledWith('Test Timer')
    })

    it('debug.timeEnd ends timer in development', () => {
      debug.timeEnd('Test Timer')
      
      expect(consoleTimeEndSpy).toHaveBeenCalledWith('Test Timer')
    })

    it('debug utilities do nothing in production', () => {
      process.env.NODE_ENV = 'production'
      
      debug.table('Test Data', [])
      debug.time('Test Timer')
      debug.timeEnd('Test Timer')
      
      expect(consoleGroupSpy).not.toHaveBeenCalled()
      expect(consoleTableSpy).not.toHaveBeenCalled()
      expect(consoleTimeSpy).not.toHaveBeenCalled()
      expect(consoleTimeEndSpy).not.toHaveBeenCalled()
    })
  })
})