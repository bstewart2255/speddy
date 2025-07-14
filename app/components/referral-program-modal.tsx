                    'use client';

                    import { useState, useEffect, Suspense } from 'react';
                    import { X } from 'lucide-react';
                    import { useSearchParams } from 'next/navigation';

                    function ReferralProgramModalContent() {
                      const [isOpen, setIsOpen] = useState(false);
                      const searchParams = useSearchParams();

                      useEffect(() => {
                        // Check if the URL has the referral parameter
                        const shouldOpen = searchParams.get('referral-program') === 'true';
                        setIsOpen(shouldOpen);
                      }, [searchParams]);

                      const handleClose = () => {
                        setIsOpen(false);
                        // Remove the query parameter when closing
                        const url = new URL(window.location.href);
                        url.searchParams.delete('referral-program');
                        window.history.pushState({}, '', url);
                      };

                      if (!isOpen) return null;

                      return (
                        <div className="fixed inset-0 z-50 overflow-y-auto">
                          {/* Backdrop */}
                          <div 
                            className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity"
                            onClick={handleClose}
                          />

                          {/* Modal - wider and shorter */}
                          <div className="flex min-h-full items-center justify-center p-4 text-center sm:p-0">
                            <div className="relative transform overflow-hidden rounded-lg bg-white px-4 pb-4 pt-5 text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-2xl sm:p-6">
                              {/* Close button */}
                              <div className="absolute right-0 top-0 pr-4 pt-4">
                                <button
                                  type="button"
                                  className="rounded-md bg-white text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                                  onClick={handleClose}
                                >
                                  <span className="sr-only">Close</span>
                                  <X className="h-6 w-6" />
                                </button>
                              </div>

                              {/* Content with max height and scroll */}
                              <div className="sm:flex sm:items-start max-h-[70vh] overflow-y-auto">
                                <div className="mt-3 text-center sm:mt-0 sm:text-left w-full">
                                  <h2 className="text-xl font-bold text-gray-900 mb-4">
                                    The Speddy Referral Program - Get the Word Out!
                                  </h2>

                                  <h3 className="text-base font-semibold text-gray-900 mb-2">
                                    Help Fellow Teachers Discover Speddy While Earning Some Moolah 💵
                                  </h3>

                                  <p className="text-sm text-gray-700 mb-4">
                                    At Speddy, we believe the best recommendations come from teachers who love what they do. That's why we offer a referral program that helps you keep some money in your pocket :)
                                  </p>

                                  <h4 className="text-sm font-semibold text-gray-900 mb-3">Here's How It Works:</h4>

                                  <div className="space-y-3 mb-4">
                                    <div>
                                      <p className="text-base font-medium text-gray-900 mb-1">🎁 Share Your Code, Share the Savings</p>
                                      <p className="text-sm text-gray-700">
                                        When you share your unique referral code with other teachers, they'll receive an extended 60-day free trial (that's 30 extra days!) to experience everything Speddy has to offer.
                                      </p>
                                    </div>

                                    <div>
                                      <p className="text-base font-medium text-gray-900 mb-1">💰 Earn $1 Off Every Month</p>
                                      <p className="text-sm text-gray-700">
                                        For each teacher who signs up using your code and becomes an active subscriber, you'll receive a referral credit for $1 off your monthly subscription. It's our way of saying thank you!
                                      </p>
                                    </div>

                                    <div>
                                      <p className="text-base font-medium text-gray-900 mb-1">🚀 Unlimited Earning Potential</p>
                                      <p className="text-sm text-gray-700">
                                        There's no cap on referral credits! Refer 12 teachers who stay active, and your Speddy subscription is completely FREE. Wait! There's more ...
                                      </p>
                                    </div>

                                    <div>
                                      <p className="text-base font-medium text-gray-900 mb-1">💸 We Will Actually Pay YOU!</p>
                                      <p className="text-sm text-gray-700">
                                        Have more than 12 active referrals? We'll pay you the difference each month! Turn your Speddy love into some extra grub (or coffees, new markers, a massage - whatever the heck you need).
                                      </p>
                                      <p className="text-xs text-gray-500 mt-1">**Some conditions do apply - see full terms for details.</p>
                                    </div>

                                    <div>
                                      <p className="text-base font-medium text-gray-900 mb-1">🏫 School District Benefits</p>
                                      <ul className="list-disc list-inside text-sm text-gray-700 space-y-1">
                                        <li><span className="font-medium">Already paying for Speddy?</span> If your district picks up the tab, we'll refund up to 6 months of your personal payments</li>
                                        <li><span className="font-medium">Refer your district?</span> Earn $500 when they sign up 😎</li>
                                      </ul>
                                    </div>
                                  </div>

                                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                                    <p className="text-sm font-semibold text-gray-900 mb-1">Ready to Start Sharing?</p>
                                    <p className="text-sm text-gray-700">
                                      Your referral code is waiting in your account dashboard. Share it loud and proud! 💪
                                    </p>
                                  </div>
                                </div>
                              </div>

                              {/* Action buttons */}
                              <div className="mt-4 sm:mt-4 sm:flex sm:flex-row-reverse">
                                <button
                                  type="button"
                                  className="inline-flex w-full justify-center rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 sm:ml-3 sm:w-auto"
                                  onClick={handleClose}
                                >
                                  Got it!
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    }

                    export function ReferralProgramModal() {
                      return (
                        <Suspense fallback={null}>
                          <ReferralProgramModalContent />
                        </Suspense>
                      );
                    }