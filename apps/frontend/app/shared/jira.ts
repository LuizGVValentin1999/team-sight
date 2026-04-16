export type JiraIssueDetailsPayload = {
  issue: {
    key: string;
    summary: string;
    issueUrl: string;
    createdAt: string;
    currentStatus: string;
    currentAssignee: string;
  };
  person?: {
    id: string;
    name: string;
    jiraUserKey: string | null;
  };
  businessHoursConfig: {
    timezone: string;
    workdays: string[];
    windows: string[];
  };
  summary: {
    totalBusinessHours: number;
    totalTestBusinessHours: number;
    totalDoubleCheckBusinessHours: number;
  };
  statusTimes: Array<{
    status: string;
    businessHours: number;
  }>;
  codeTimesByAssignee: Array<{
    assignee: string;
    businessHours: number;
    statusTimes: Array<{
      status: string;
      businessHours: number;
    }>;
  }>;
  testTimesByAssignee: Array<{
    assignee: string;
    businessHours: number;
    statusTimes: Array<{
      status: string;
      businessHours: number;
    }>;
  }>;
  doubleCheckTimesByAssignee: Array<{
    assignee: string;
    businessHours: number;
    statusTimes: Array<{
      status: string;
      businessHours: number;
    }>;
  }>;
  actionLog: Array<{
    actionId: string;
    at: string;
    actionType: 'STATUS_CHANGE' | 'ASSIGNEE_CHANGE';
    actor: string;
    from: string | null;
    to: string | null;
    businessHoursSincePreviousAction: number | null;
  }>;
};
