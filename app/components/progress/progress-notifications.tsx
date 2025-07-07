'use client';

import { useState, useEffect } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { Bell, TrendingUp, Trophy, AlertCircle, Target } from 'lucide-react';

interface Notification {
  id: string;
  student_id: string;
  notification_type: 'milestone' | 'improvement' | 'concern' | 'goal_met';
  title: string;
  message: string;
  data: any;
  read: boolean;
  created_at: string;
  student?: {
    initials: string;
  };
}

export function ProgressNotifications() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const supabase = createClientComponentClient();

  useEffect(() => {
    loadNotifications();
  }, []);

  const loadNotifications = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from('progress_notifications')
        .select(`
          *,
          student:students(initials)
        `)
        .eq('provider_id', user.id)
        .order('created_at', { ascending: false })
        .limit(showAll ? 50 : 5);

      setNotifications(data || []);
    } catch (error) {
      console.error('Error loading notifications:', error);
    } finally {
      setLoading(false);
    }
  };

  const markAsRead = async (notificationId: string) => {
    await supabase
      .from('progress_notifications')
      .update({ read: true })
      .eq('id', notificationId);

    setNotifications(notifications.map(n => 
      n.id === notificationId ? { ...n, read: true } : n
    ));
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'milestone':
        return <Trophy className="w-5 h-5 text-blue-600" />;
      case 'improvement':
        return <TrendingUp className="w-5 h-5 text-green-600" />;
      case 'concern':
        return <AlertCircle className="w-5 h-5 text-orange-600" />;
      case 'goal_met':
        return <Target className="w-5 h-5 text-purple-600" />;
      default:
        return <Bell className="w-5 h-5 text-gray-600" />;
    }
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  if (loading) {
    return <div className="animate-pulse h-32 bg-gray-100 rounded-lg"></div>;
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Bell className="w-5 h-5" />
          Progress Notifications
          {unreadCount > 0 && (
            <span className="bg-red-500 text-white text-xs rounded-full px-2 py-1">
              {unreadCount}
            </span>
          )}
        </h3>
        <button
          onClick={() => {
            setShowAll(!showAll);
            if (!showAll) loadNotifications();
          }}
          className="text-sm text-blue-600 hover:text-blue-800"
        >
          {showAll ? 'Show Less' : 'Show All'}
        </button>
      </div>

      {notifications.length === 0 ? (
        <p className="text-gray-500 text-center py-4">No notifications yet</p>
      ) : (
        <div className="space-y-3">
          {notifications.map((notification) => (
            <div
              key={notification.id}
              className={`flex items-start gap-3 p-3 rounded-lg transition-colors cursor-pointer ${
                notification.read ? 'bg-gray-50' : 'bg-blue-50 hover:bg-blue-100'
              }`}
              onClick={() => !notification.read && markAsRead(notification.id)}
            >
              {getIcon(notification.notification_type)}
              <div className="flex-1">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-medium text-sm">
                      {notification.title}
                      {notification.student && (
                        <span className="text-gray-600 ml-2">
                          - {notification.student.initials}
                        </span>
                      )}
                    </p>
                    <p className="text-sm text-gray-600 mt-1">
                      {notification.message}
                    </p>
                  </div>
                  <span className="text-xs text-gray-500">
                    {new Date(notification.created_at).toLocaleDateString()}
                  </span>
                </div>
              </div>
              {!notification.read && (
                <div className="w-2 h-2 bg-blue-600 rounded-full mt-2"></div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}