# Apply RLS Policies for user_settings Table

## Quick Apply (Supabase Dashboard)

1. Go to your Supabase project dashboard
2. Navigate to **SQL Editor**
3. Click **New Query**
4. Copy and paste the SQL below
5. Click **Run**

```sql
-- Enable RLS on user_settings table
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own settings
CREATE POLICY "Users can view own settings"
  ON user_settings
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Users can insert their own settings
CREATE POLICY "Users can insert own settings"
  ON user_settings
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own settings
CREATE POLICY "Users can update own settings"
  ON user_settings
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can delete their own settings
CREATE POLICY "Users can delete own settings"
  ON user_settings
  FOR DELETE
  USING (auth.uid() = user_id);
```

## Verify RLS is Working

After applying the policies, you can verify they work by:

1. **In Supabase Dashboard**:
   - Go to **Authentication > Policies**
   - Look for `user_settings` table
   - Should see 4 policies listed

2. **Test in Application**:
   - Sign in to your app
   - Go to Settings page
   - Try to save settings
   - Settings should save successfully
   - Sign out and sign in as different user
   - Other user should NOT see first user's settings

## What These Policies Do

- ✅ **Users can only read their own settings** (not other users')
- ✅ **Users can only create settings for themselves**
- ✅ **Users can only update their own settings**
- ✅ **Users can only delete their own settings**

This ensures data isolation and security at the database level, preventing users from accessing or modifying other users' settings even if there's a bug in the application code.

## Troubleshooting

If settings are not saving after applying RLS:

1. **Check auth.uid() is working**:
   ```sql
   SELECT auth.uid();
   ```
   Should return your user ID when logged in

2. **Check user_id in settings matches auth.uid()**:
   ```sql
   SELECT user_id, auth.uid() FROM user_settings WHERE user_id = auth.uid();
   ```

3. **Check policies are enabled**:
   ```sql
   SELECT * FROM pg_policies WHERE tablename = 'user_settings';
   ```

4. **Check RLS is enabled on table**:
   ```sql
   SELECT relname, relrowsecurity
   FROM pg_class
   WHERE relname = 'user_settings';
   ```
   `relrowsecurity` should be `true`
