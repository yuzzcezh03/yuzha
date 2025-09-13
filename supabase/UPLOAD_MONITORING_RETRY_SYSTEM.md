# 🔍 UPLOAD MONITORING & RETRY SYSTEM

## 🎯 OVERVIEW

**Complete system for monitoring Google Drive upload failures and automatic retry mechanisms.**

**Features:**
- ✅ **Real-time failure detection** - Know immediately when Drive uploads fail
- ✅ **Automatic retry system** - Retry failed uploads up to 3 times
- ✅ **Smart cleanup** - Auto-delete from Supabase after successful Drive upload
- ✅ **Monitoring dashboard** - Track upload status and failures
- ✅ **Storage optimization** - Minimal long-term Supabase storage usage

---

## 🚀 DEPLOYMENT COMMANDS

**Run these in `C:\VSCODE\yuzha`:**

```bash
# 1. Deploy new database tables
supabase db push

# 2. Deploy updated functions
supabase functions deploy form-submit
supabase functions deploy user-hub  
supabase functions deploy storage-retry  # NEW
```

---

## 📊 NEW DATABASE TABLES

### **1. upload_status** - Track Upload Progress
```sql
- id: UUID (primary key)
- user_id: UUID (user reference)
- file_name: TEXT (uploaded filename)
- file_path: TEXT (Supabase storage path)
- drive_file_id: TEXT (Google Drive file ID, null if failed)
- drive_url: TEXT (Google Drive public URL, null if failed)
- upload_status: TEXT (pending/drive_success/drive_failed/cleanup_done)
- retry_count: INTEGER (number of retry attempts)
- error_message: TEXT (error details if failed)
- created_at: TIMESTAMP
- last_retry_at: TIMESTAMP
```

### **2. upload_logs** - Detailed Logging
```sql
- id: UUID (primary key)
- upload_id: UUID (reference to upload_status)
- log_level: TEXT (info/warning/error)
- message: TEXT (log message)
- details: JSONB (additional error details)
- created_at: TIMESTAMP
```

---

## 🔍 MONITORING ENDPOINTS

### **GET /user-hub/upload-status** - Monitor Your Uploads
```bash
# Get all your uploads
curl -H "Authorization: Bearer YOUR_JWT" \
     "https://xaluaekioqwxtzhnmygg.supabase.co/functions/v1/user-hub/upload-status"

# Get only failed uploads
curl -H "Authorization: Bearer YOUR_JWT" \
     "https://xaluaekioqwxtzhnmygg.supabase.co/functions/v1/user-hub/upload-status?status=drive_failed"

# Get recent 10 uploads
curl -H "Authorization: Bearer YOUR_JWT" \
     "https://xaluaekioqwxtzhnmygg.supabase.co/functions/v1/user-hub/upload-status?limit=10"
```

**Response Example:**
```json
{
  "success": true,
  "uploads": [
    {
      "id": "uuid-123",
      "file_name": "photo.jpg",
      "upload_status": "drive_failed",
      "retry_count": 1,
      "error_message": "Google Drive API timeout",
      "created_at": "2025-09-07T10:00:00Z",
      "upload_logs": [
        {
          "log_level": "error",
          "message": "Initial upload failed",
          "created_at": "2025-09-07T10:00:30Z"
        }
      ]
    }
  ],
  "summary": {
    "drive_success": 45,
    "drive_failed": 3,
    "cleanup_done": 42
  },
  "retry_available": true
}
```

---

## 🔄 RETRY SYSTEM ENDPOINTS

### **GET /storage-retry?action=retry** - Retry Failed Uploads
```bash
# Retry all failed uploads (admin/service level)
curl "https://xaluaekioqwxtzhnmygg.supabase.co/functions/v1/storage-retry?action=retry"
```

**Response:**
```json
{
  "success": true,
  "message": "Retry process completed",
  "total_found": 5,
  "retried": 5,
  "successful": 3
}
```

### **GET /storage-retry?action=cleanup** - Clean Successful Uploads
```bash
# Clean up storage for successful uploads
curl "https://xaluaekioqwxtzhnmygg.supabase.co/functions/v1/storage-retry?action=cleanup"
```

### **GET /storage-retry?action=status** - System-wide Status
```bash
# Get overall system status
curl "https://xaluaekioqwxtzhnmygg.supabase.co/functions/v1/storage-retry?action=status"
```

---

## 📈 WORKFLOW EXPLANATION

### **🔄 NORMAL UPLOAD FLOW:**
```
1. User uploads photo → Supabase Storage (temporary)
2. System uploads → Google Drive (permanent)
3. ✅ Drive Success → Auto-delete from Supabase → Status: 'cleanup_done'
4. ❌ Drive Fails → Keep in Supabase → Status: 'drive_failed'
```

### **🔁 RETRY FLOW:**
```
1. System detects failed uploads (status = 'drive_failed')
2. Downloads file from Supabase Storage
3. Retries Google Drive upload
4. ✅ Retry Success → Delete from Supabase → Status: 'cleanup_done'
5. ❌ Retry Fails → Increment retry_count → Try again later
6. After 3 failed retries → Keep in Supabase permanently
```

---

## 🚨 FAILURE DETECTION

### **How You Know If Drive Upload Fails:**

**1. Check Upload Status API:**
```bash
curl -H "Authorization: Bearer JWT" \
     "https://xaluaekioqwxtzhnmygg.supabase.co/functions/v1/user-hub/upload-status?status=drive_failed"
```

**2. Monitor Response Fields:**
- `upload_status: "drive_failed"` - Upload failed
- `retry_count: 2` - Number of retry attempts
- `error_message: "Drive API timeout"` - Specific error details

**3. Check Logs:**
- `upload_logs` array contains detailed error information
- `log_level: "error"` indicates failure points

---

## ⚡ AUTOMATIC RETRY TRIGGERS

### **Manual Retry (Immediate):**
```bash
curl "https://xaluaekioqwxtzhnmygg.supabase.co/functions/v1/storage-retry?action=retry"
```

### **Scheduled Retry (Recommended):**
Set up a cron job or scheduler to run retry every hour:
```bash
# Run every hour via cron or scheduler
0 * * * * curl "https://xaluaekioqwxtzhnmygg.supabase.co/functions/v1/storage-retry?action=retry"
```

### **Retry Logic:**
- **Retry Limit**: Maximum 3 attempts per upload
- **Retry Delay**: 1 hour minimum between retries
- **Smart Selection**: Only retries uploads that haven't exceeded limit

---

## 📊 MONITORING DASHBOARD DATA

### **Key Metrics You Can Track:**

**Upload Success Rate:**
```json
{
  "summary": {
    "drive_success": 95,    // 95 successful uploads
    "drive_failed": 3,      // 3 failed uploads  
    "cleanup_done": 90,     // 90 cleaned up from Supabase
    "pending": 2            // 2 still processing
  }
}
```

**Failure Analysis:**
- Which uploads are failing most
- Common error patterns
- Retry success rates
- Storage cleanup status

---

## 🔧 TROUBLESHOOTING

### **Common Issues:**

#### **1. "No failed uploads to retry"**
- **Meaning**: All uploads are successful or already retried
- **Action**: Check upload-status endpoint to confirm

#### **2. "File not found in storage"**
- **Meaning**: File was deleted from Supabase but retry record exists
- **Action**: System will skip and log this automatically

#### **3. "Google Drive API timeout"**
- **Meaning**: Drive service temporarily unavailable
- **Action**: Retry will attempt again in 1 hour

#### **4. High retry_count without success**
- **Meaning**: Persistent Drive connectivity issues
- **Action**: Check Google service account credentials

---

## 💡 OPTIMIZATION TIPS

### **Storage Efficiency:**
- ✅ **Most uploads**: Stored in Google Drive only (free 15GB)
- ✅ **Failed uploads**: Temporary Supabase storage until retry succeeds
- ✅ **Auto-cleanup**: Removes files after successful Drive upload

### **Monitoring Best Practices:**
- Check upload-status weekly to monitor failure rates
- Run retry process hourly or daily via scheduler
- Alert if failure rate exceeds 10%

### **Cost Management:**
- Successful uploads = minimal Supabase storage cost
- Failed uploads kept temporarily until retry succeeds
- Maximum 3 retries prevents infinite storage accumulation

---

## 🎯 SUCCESS INDICATORS

### **System is Working Well When:**
- ✅ `summary.drive_success` > 90% of total uploads
- ✅ `summary.cleanup_done` ≈ `summary.drive_success`
- ✅ `summary.drive_failed` has low retry_count values
- ✅ Few uploads with `retry_count >= 3`

### **System Needs Attention When:**
- ❌ `summary.drive_failed` > 10% of total uploads
- ❌ Many uploads with `retry_count >= 3`
- ❌ `error_message` shows consistent API errors
- ❌ Large gap between `drive_success` and `cleanup_done`

---

## 🚀 READY TO USE!

**Your comprehensive upload monitoring system is now:**
- ✅ **Tracking all uploads** with detailed status
- ✅ **Automatically retrying failures** up to 3 times
- ✅ **Optimizing storage costs** with smart cleanup
- ✅ **Providing real-time monitoring** via APIs
- ✅ **Logging detailed error information** for debugging

**Deploy the system and never lose an upload again!** 🎉

---

**Last Updated**: September 2025  
**Status**: ✅ READY FOR DEPLOYMENT  
**Project**: https://xaluaekioqwxtzhnmygg.supabase.co