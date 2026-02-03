# Project Sell Management - Admin Panel

## Overview

The Project Sell Management module provides comprehensive administrative control over project sales, orders, and reviews in the BuzYoo platform. This feature allows administrators to manage all aspects of the project marketplace from a centralized dashboard.

## Features

### 1. All Projects Tab
- **View all projects**: Display all projects in the system regardless of status
- **Project details**: View comprehensive project information including images, descriptions, and metadata
- **Delete projects**: Remove projects from the platform with confirmation
- **Project statistics**: View views, likes, and inquiries for each project
- **Status management**: See project status (draft, published, sold, archived)

### 2. Orders Management Tab
- **Order overview**: View all purchase orders in the system
- **Order details**: Access complete order information including buyer, seller, and project details
- **Status tracking**: Monitor order and delivery status
- **Status updates**: Update delivery status (not_started → in_progress → review → delivered → accepted)
- **Payment information**: View payment details and amounts

### 3. Review Management Tab
- **Review moderation**: Approve or reject user reviews
- **Review details**: View complete review information including ratings and comments
- **Quality control**: Ensure only appropriate reviews are displayed
- **Review statistics**: Track review approval status

## API Endpoints

### Project Management
```
GET /api/v1/project-sell/admin/projects
DELETE /api/v1/project-sell/admin/projects/:id
```

### Order Management
```
GET /api/v1/project-purchase/admin/orders
PUT /api/v1/project-purchase/admin/purchase/:purchaseId/status
```

### Review Management
```
GET /api/v1/project-purchase/admin/reviews
PUT /api/v1/project-purchase/admin/reviews/:reviewId/approve
PUT /api/v1/project-purchase/admin/reviews/:reviewId/reject
```

## Database Schema Updates

### ProjectPurchaseModel
Added new fields for review approval:
```javascript
reviewApproved: {
  type: Boolean,
  default: false,
},
reviewApprovedAt: {
  type: Date,
}
```

## Frontend Components

### ProjectSellManagement.js
Main component with three tabs:
- All Projects management
- Orders management
- Review management

### ProjectSellManagement.css
Comprehensive styling for the admin interface including:
- Responsive design
- Modern UI components
- Modal dialogs
- Status badges
- Action buttons

## Usage

### Accessing the Feature
1. Navigate to the admin dashboard
2. Click on "Project Sell Management" in the sidebar
3. Use the three tabs to manage different aspects

### Managing Projects
1. Go to "All Projects" tab
2. View project cards with key information
3. Click "View Details" to see full project information
4. Click "Delete" to remove projects (with confirmation)

### Managing Orders
1. Go to "Orders Management" tab
2. View order table with all purchase information
3. Click "View" to see detailed order information
4. Use action buttons to update delivery status

### Managing Reviews
1. Go to "Review Management" tab
2. View review cards with ratings and comments
3. Click "Approve" or "Reject" to moderate reviews
4. Rejected reviews are removed from the system

## Security

- All admin endpoints require authentication
- Admin-only access to sensitive operations
- Confirmation dialogs for destructive actions
- Input validation and sanitization

## Testing

Run the test file to verify API functionality:
```bash
node test-project-sell-admin.js
```

## Future Enhancements

- Bulk operations for projects and orders
- Advanced filtering and search capabilities
- Export functionality for reports
- Automated review moderation
- Performance analytics dashboard
