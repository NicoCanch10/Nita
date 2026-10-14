export interface LanguageOption {
  code: string;
  name: string;
  nativeName: string;
  flag: string;
  country: string;
}

export interface Translations {
  months: string[];
  daysShort: string[];
  appTitle: string;
  monthYear: string;
  previousMonth: string;
  nextMonth: string;
  monthLabel: string;
  
  // Navigation Tabs
  tabAll: string;
  tabJars: string;
  tabFixed: string;
  tabDaily: string;
  tabHealth: string;
  
  // Metric Cards
  netIncome: string;
  incomePlaceholder: string;
  confirmAmount: string;
  cancel: string;
  clickToEditIncome: string;
  variableExpenses: string;
  percentOfIncome: string;
  availableToDistribute: string;
  fixedExpensesLabel: string;
  savingsFixedLabel: string;
  monthDaysSummary: string;
  shortcuts: string;
  paidFixedLabel: string;
  pendingFixedLabel: string;
  paceExcellentLabel: string;
  paceHighLabel: string;
  variableBalanceLabel: string;
  adjustSavingsSlider: string;
  
  // Savings Bar
  savingsBarTitle: string;
  savingsBarSubtitle: string;
  savingsAmountLabel: string;
  savingsRateLabel: string;
  noSavings: string;
  
  // 5 Jars Section
  fiveJarsTitle: string;
  fiveJarsSubtitle: string;
  extraDaysLabel: string;
  extraDaysFirst: string;
  extraDaysLast: string;
  toggleJarsMobileExpand: string;
  toggleJarsMobileCollapse: string;
  inProgress: string;
  available: string;
  leftover: string;
  zeroBalance: string;
  overBudget: string;
  spent: string;
  assignedAmount: string;
  verificationNote: string;
  extraDaysLocation: string;
  noExtraDays: string;
  daysUnitSingular: string;
  daysUnitPlural: string;
  extraDaysFormula: string;
  weeklyJarFormula: string;
  jarExtraDaysTitle: string;
  jarWeekPrefix: string;
  jarOverbudgetPromptTitle: string;
  jarOverbudgetConfirmBtn: string;
  jarOverbudgetDismissBtn: string;
  jarOverbudgetRevertBtn: string;
  jarAdjustedPositive: string;
  jarAdjustedNegative: string;
  
  // Fixed Expenses Section
  fixedExpensesTitle: string;
  fixedExpensesTitleLine1: string;
  fixedExpensesTitleLine2: string;
  fixedTotalMonthly: string;
  paidStatus: string;
  pendingStatus: string;
  addFixedExpense: string;
  expenseConceptPlaceholder: string;
  amountPlaceholder: string;
  dueDatePlaceholder: string;
  categorySelectPlaceholder: string;
  addButton: string;
  filterAll: string;
  filterPending: string;
  filterPaid: string;
  searchFixedPlaceholder: string;
  markPaid: string;
  markPending: string;
  editExpense: string;
  deleteExpense: string;
  saveChanges: string;
  noFixedExpenses: string;
  noMatchingFixed: string;
  dueDayShort: string;
  customCategoryTag: string;
  categoriesAndColorsBtn: string;
  
  // Daily Expenses Section
  dailyExpensesTitle: string;
  totalSpent: string;
  dailyAverage: string;
  perDay: string;
  descPlaceholder: string;
  dateFormatLabel: string;
  searchDailyPlaceholder: string;
  allCategoriesFilter: string;
  noDailyExpenses: string;
  noMatchingDaily: string;
  validationBoth: string;
  validationDesc: string;
  validationAmount: string;
  
  // Financial Health Section
  healthTitle: string;
  optionalTag: string;
  rule503020Summary: string;
  needsFixed: string;
  wantsVariable: string;
  savingsTarget: string;
  simulatorTitle: string;
  simulatorSubtitle: string;
  simulateFixedCut: string;
  simulateIncomeBoost: string;
  newDailyBudget: string;
  dailyGain: string;
  categoryBreakdownTitle: string;
  structuralCostExcellent: string;
  structuralCostHigh: string;
  flowForJars: string;
  moneyComposition: string;
  moderateCut: string;
  simResultTitle: string;
  simProjectedIncome: string;
  simProjectedDistribution: string;
  simPillarSavings: string;
  simPillarFixed: string;
  simPillarVariable: string;
  simRealtimeNote: string;
  simExtraGainNote: string;
  simExtraIncomeImpactNote: string;
  
  // Due Alert Banner & Notifications
  alertDueTodayTitle: string;
  alertDueSoonTitle: string;
  alertDueBothTitle: string;
  markPaidBtn: string;
  dismissAlert: string;
  notificationsTitle: string;
  noUpcomingDues: string;
  upcomingCountTitle: string;
  enableNotificationsPrompt: string;
  enableNotificationsBtn: string;
  daysBeforeDue: string;
  dueTodayNotice: string;
  overdueNotice: string;
  
  // Settings Menu
  settingsTitle: string;
  settingsSubtitle: string;
  visualTheme: string;
  whiteMode: string;
  darkMode: string;
  currencyFormat: string;
  appLanguage: string;
  dueAlertsTitle: string;
  dueAlertsSubtitle: string;
  alertAdvanceLabel: string;
  daysInAdvanceUnit: string;
  alertsDisabledNotice: string;
  alertScheduleNote: string;
  downloadAppTitle: string;
  installAppBtn: string;
  appUpdatesTitle: string;
  newVersionAvailable: string;
  updateNowBtn: string;
  checkForUpdatesBtn: string;
  checkingBtn: string;
  autoUpdateNotice: string;
  guideTutorialBtn: string;
  dayBeforeSingular: string;
  dayBeforePlural: string;
  subtractDayTitle: string;
  addDayTitle: string;
  
  // Onboarding & Modals
  closeModal: string;
  onboardingTitle: string;
  stepNext: string;
  stepPrev: string;
  stepFinish: string;
  stepOf: string;
  
  // Category Manager Modal
  catManagerTitle: string;
  catManagerSubtitle: string;
  createNewCat: string;
  catNamePlaceholder: string;
  chooseColor: string;
  existingCats: string;
  cannotDeleteDefaultCat: string;
  
  // Footer & Misc
  footerMonth: string;
  copyPreviousMonthTitle: string;
  copyPreviousMonthBtn: string;
  resetMonthBtn: string;
  exportCsvBtn: string;
  confirmReset: string;
  confirmCopy: string;
  noPreviousMonthData: string;
  understood: string;
}
