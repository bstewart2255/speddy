"use client"

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardBody, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/form'
import type { Database } from '../../src/types/database'

type Todo = {
  id: string
  user_id: string
  task: string
  completed: boolean
  created_at: string
  due_date?: string | null
}

export function TodoWidget() {
  const [todos, setTodos] = useState<Todo[]>([])
  const [newTask, setNewTask] = useState('')
  const [loading, setLoading] = useState(true)
  const [isAddingTask, setIsAddingTask] = useState(false)
  const supabase = createClient<Database>()

  const fetchTodos = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data, error } = await supabase
        .from('todos')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })

      if (error) {
        console.error('Error fetching todos:', error)
      } else {
        setTodos(data || [])
      }
    } catch (error) {
      console.error('Error:', error)
    } finally {
      setLoading(false)
    }
  }, [supabase])

  useEffect(() => {
    fetchTodos()
  }, [fetchTodos])

  const addTodo = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTask.trim()) return

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data, error } = await supabase
        .from('todos')
        .insert([{
          user_id: user.id,
          task: newTask.trim(),
          completed: false
        }])
        .select()
        .single()

      if (error) {
        console.error('Error adding todo:', error)
        alert('Failed to add task')
      } else if (data) {
        setTodos([data, ...todos])
        setNewTask('')
        setIsAddingTask(false)
      }
    } catch (error) {
      console.error('Error:', error)
    }
  }

  const toggleTodo = async (id: string, completed: boolean) => {
    try {
      const { error } = await supabase
        .from('todos')
        .update({ completed: !completed })
        .eq('id', id)

      if (error) {
        console.error('Error updating todo:', error)
      } else {
        setTodos(todos.map(todo => 
          todo.id === id ? { ...todo, completed: !completed } : todo
        ))
      }
    } catch (error) {
      console.error('Error:', error)
    }
  }

  const deleteTodo = async (id: string) => {
    try {
      const { error } = await supabase
        .from('todos')
        .delete()
        .eq('id', id)

      if (error) {
        console.error('Error deleting todo:', error)
      } else {
        setTodos(todos.filter(todo => todo.id !== id))
      }
    } catch (error) {
      console.error('Error:', error)
    }
  }

  if (loading) {
    return (
      <Card>
        <CardBody className="pt-6">
          <div className="animate-pulse space-y-2">
            <div className="h-4 bg-gray-200 rounded w-1/2"></div>
            <div className="h-4 bg-gray-200 rounded w-3/4"></div>
            <div className="h-4 bg-gray-200 rounded w-2/3"></div>
          </div>
        </CardBody>
      </Card>
    )
  }

  const incompleteTodos = todos.filter(t => !t.completed)
  const completedTodos = todos.filter(t => t.completed)

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between w-full gap-4">
          <CardTitle className="flex items-center gap-2 mb-0">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
            To-Do List
          </CardTitle>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setIsAddingTask(!isAddingTask)}
          >
            <span className="text-lg mr-1">+</span> Add
          </Button>
        </div>
      </CardHeader>
      <CardBody className="pt-0">
        {isAddingTask && (
          <form onSubmit={addTodo} className="mb-4">
            <div className="flex gap-2">
              <Input
                type="text"
                value={newTask}
                onChange={(e) => setNewTask(e.target.value)}
                placeholder="Enter a new task..."
                className="flex-1"
                autoFocus
              />
              <Button type="submit" size="sm" variant="primary">
                Add
              </Button>
              <Button 
                type="button" 
                size="sm" 
                variant="secondary"
                onClick={() => {
                  setIsAddingTask(false)
                  setNewTask('')
                }}
              >
                Cancel
              </Button>
            </div>
          </form>
        )}

        {incompleteTodos.length === 0 && completedTodos.length === 0 ? (
          <p className="text-sm text-gray-500 italic text-center py-4">
            No tasks yet. Click "+ Add" to create one!
          </p>
        ) : (
          <>
            {/* Incomplete tasks */}
            {incompleteTodos.length > 0 && (
              <div className="space-y-2 mb-4">
                {incompleteTodos.map((todo) => (
                  <div key={todo.id} className="flex items-center gap-2 group">
                    <input
                      type="checkbox"
                      checked={todo.completed}
                      onChange={() => toggleTodo(todo.id, todo.completed)}
                      className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                    />
                    <span className="flex-1 text-sm">{todo.task}</span>
                    <button
                      onClick={() => deleteTodo(todo.id)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity text-red-500 hover:text-red-700 p-1"
                      title="Delete task"
                    >
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Completed tasks */}
            {completedTodos.length > 0 && (
              <div>
                <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
                  Completed ({completedTodos.length})
                </h4>
                <div className="space-y-2">
                  {completedTodos.map((todo) => (
                    <div key={todo.id} className="flex items-center gap-2 group opacity-60">
                      <input
                        type="checkbox"
                        checked={todo.completed}
                        onChange={() => toggleTodo(todo.id, todo.completed)}
                        className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                      />
                      <span className="flex-1 text-sm line-through">{todo.task}</span>
                      <button
                        onClick={() => deleteTodo(todo.id)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity text-red-500 hover:text-red-700 p-1"
                        title="Delete task"
                      >
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </CardBody>
    </Card>
  )
}