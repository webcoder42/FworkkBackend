# Report System API Documentation

## Overview
The Report System allows users to report other users for various violations and issues. Admins can review and manage these reports.

## API Endpoints

### 1. Create Report
**POST** `/api/v1/reports/create`
- **Authentication**: Required
- **Description**: Submit a new report against a user
- **Body**:
  ```json
  {
    "reportedUserId": "user_id_here",
    "category": "inappropriate_content",
    "subCategory": "explicit_content",
    "title": "Report Title",
    "description": "Detailed description of the issue",
    "evidence": ["url1", "url2"]
  }
  ```

### 2. Get My Reports
**GET** `/api/v1/reports/my-reports?page=1&limit=10`
- **Authentication**: Required
- **Description**: Get reports submitted by the current user
- **Query Parameters**:
  - `page`: Page number (default: 1)
  - `limit`: Items per page (default: 10)

### 3. Get Report Categories
**GET** `/api/v1/reports/categories`
- **Authentication**: Not required
- **Description**: Get all available report categories and subcategories

### 4. Get All Reports (Admin)
**GET** `/api/v1/reports/all?page=1&limit=10&status=pending&category=inappropriate_content&sortBy=createdAt&sortOrder=desc`
- **Authentication**: Required (Admin)
- **Description**: Get all reports with filtering and pagination
- **Query Parameters**:
  - `page`: Page number
  - `limit`: Items per page
  - `status`: Filter by status
  - `category`: Filter by category
  - `sortBy`: Sort field
  - `sortOrder`: Sort direction (asc/desc)

### 5. Get Report by ID (Admin)
**GET** `/api/v1/reports/:reportId`
- **Authentication**: Required (Admin)
- **Description**: Get detailed information about a specific report

### 6. Update Report Status (Admin)
**PUT** `/api/v1/reports/:reportId/status`
- **Authentication**: Required (Admin)
- **Description**: Update report status and add admin notes
- **Body**:
  ```json
  {
    "status": "resolved",
    "adminNotes": "Admin notes here",
    "actionTaken": "warning",
    "actionDetails": "Details of action taken"
  }
  ```

### 7. Delete Report (Admin)
**DELETE** `/api/v1/reports/:reportId`
- **Authentication**: Required (Admin)
- **Description**: Delete a report

### 8. Get Report Statistics (Admin)
**GET** `/api/v1/reports/stats`
- **Authentication**: Required (Admin)
- **Description**: Get report statistics and analytics

### 9. Get Reports Against User (Admin)
**GET** `/api/v1/reports/user/:userId?page=1&limit=10`
- **Authentication**: Required (Admin)
- **Description**: Get all reports against a specific user

## Report Categories

### 1. Inappropriate Content
- **explicit_content**: Explicit or adult content
- **violent_content**: Violent or graphic content
- **hate_speech**: Hate speech or discrimination
- **misleading_information**: False or misleading information

### 2. Fake Profile
- **fake_identity**: Fake identity or impersonation
- **stolen_photos**: Stolen or fake profile photos
- **fake_credentials**: Fake qualifications or credentials

### 3. Payment Issues
- **payment_holding**: Unauthorized payment holding
- **refund_issues**: Refund problems
- **fake_payment_proof**: Fake payment proof

### 4. Project Not Submitted
- **delayed_submission**: Delayed project submission
- **incomplete_work**: Incomplete or poor quality work
- **no_submission**: No project submission

### 5. Poor Communication
- **unresponsive**: Unresponsive communication
- **rude_behavior**: Rude or unprofessional behavior
- **unprofessional**: Unprofessional conduct

### 6. Spam/Harassment
- **spam_messages**: Spam messages
- **harassment**: Harassment or stalking
- **bullying**: Bullying behavior

### 7. Fake Reviews
- **fake_positive_reviews**: Fake positive reviews
- **fake_negative_reviews**: Fake negative reviews
- **review_manipulation**: Review manipulation

### 8. Copyright Violation
- **stolen_content**: Stolen content or work
- **plagiarism**: Plagiarism
- **unauthorized_use**: Unauthorized use of content

### 9. Other
- **other_issue**: Other issues not covered above

## Report Statuses

- **pending**: Report is pending review
- **under_review**: Report is being reviewed
- **resolved**: Report has been resolved
- **dismissed**: Report was dismissed
- **action_taken**: Action has been taken

## Action Taken Types

- **warning**: Warning issued to user
- **temporary_suspension**: Temporary account suspension
- **permanent_ban**: Permanent account ban
- **no_action**: No action taken
- **other**: Other action taken

## Response Format

All API responses follow this format:
```json
{
  "success": true/false,
  "message": "Response message",
  "data": {},
  "pagination": {} // For paginated responses
}
```

## Error Handling

The API returns appropriate HTTP status codes:
- `200`: Success
- `201`: Created
- `400`: Bad Request
- `401`: Unauthorized
- `403`: Forbidden
- `404`: Not Found
- `500`: Internal Server Error

## Rate Limiting

Users can only submit one report against the same user within 24 hours to prevent spam.

## Security Features

- Authentication required for all report operations
- Admin-only access for report management
- Input validation and sanitization
- Rate limiting on report creation
- Self-reporting prevention
