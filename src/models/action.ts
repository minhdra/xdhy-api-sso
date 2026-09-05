export interface Action {
  action_code: string;
  function_id: string;
  action_api_url: string;
  action_name: string;
  description: string;
  active_flag: number;
  created_by_user_id: string;
  created_date_time: Date;
  lu_updated: Date;
  lu_user_id: string;
}
