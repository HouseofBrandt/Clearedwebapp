"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"

interface User {
  id: string
  name: string
  email: string
  role: string
  licenseType: string
  licenseNumber: string
  createdAt: string
}

const emptyForm = {
  name: "",
  email: "",
  password: "",
  role: "PRACTITIONER",
  licenseType: "EA",
  licenseNumber: "",
}

export function UserManagement() {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [editUser, setEditUser] = useState<User | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")
  const [form, setForm] = useState(emptyForm)

  async function fetchUsers() {
    try {
      const res = await fetch("/api/users")
      if (res.ok) {
        setUsers(await res.json())
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchUsers()
  }, [])

  function openCreateDialog() {
    setEditUser(null)
    setForm(emptyForm)
    setError("")
    setOpen(true)
  }

  function openEditDialog(user: User) {
    setEditUser(user)
    setForm({
      name: user.name,
      email: user.email,
      password: "",
      role: user.role,
      licenseType: user.licenseType,
      licenseNumber: user.licenseNumber,
    })
    setError("")
    setOpen(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError("")

    try {
      if (editUser) {
        // Update existing user
        const payload: any = {
          name: form.name,
          email: form.email,
          role: form.role,
          licenseType: form.licenseType,
          licenseNumber: form.licenseNumber,
        }
        if (form.password) {
          payload.password = form.password
        }

        const res = await fetch(`/api/users/${editUser.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })

        if (!res.ok) {
          const data = await res.json()
          setError(data.error || "Failed to update user")
          return
        }
      } else {
        // Create new user
        if (!form.password) {
          setError("Password is required for new users")
          return
        }
        const res = await fetch("/api/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        })

        if (!res.ok) {
          const data = await res.json()
          setError(data.error || "Failed to create user")
          return
        }
      }

      setForm(emptyForm)
      setEditUser(null)
      setOpen(false)
      fetchUsers()
    } catch {
      setError(editUser ? "Failed to update user" : "Failed to create user")
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete(user: User) {
    if (!confirm(`Are you sure you want to remove ${user.name}? This cannot be undone.`)) {
      return
    }

    try {
      const res = await fetch(`/api/users/${user.id}`, { method: "DELETE" })
      if (res.ok) {
        fetchUsers()
      } else {
        const data = await res.json()
        alert(data.error || "Failed to delete user")
      }
    } catch {
      alert("Failed to delete user")
    }
  }

  const roleBadgeColor: Record<string, string> = {
    ADMIN: "bg-red-100 text-red-800",
    SENIOR: "bg-blue-100 text-blue-800",
    PRACTITIONER: "bg-green-100 text-green-800",
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>User Management</CardTitle>
          <CardDescription>Add and manage practitioners and staff</CardDescription>
        </div>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditUser(null) }}>
          <DialogTrigger asChild>
            <Button onClick={openCreateDialog}>Add User</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editUser ? `Edit ${editUser.name}` : "Add New User"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="text-sm text-red-600 bg-red-50 p-3 rounded-md">{error}</div>
              )}
              <div className="space-y-2">
                <Label htmlFor="name">Full Name</Label>
                <Input
                  id="name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">
                  {editUser ? "New Password (leave blank to keep current)" : "Password"}
                </Label>
                <Input
                  id="password"
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  minLength={8}
                  required={!editUser}
                  placeholder={editUser ? "Leave blank to keep current" : ""}
                />
                <p className="text-xs text-muted-foreground">Minimum 8 characters</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Role</Label>
                  <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PRACTITIONER">Practitioner</SelectItem>
                      <SelectItem value="SENIOR">Senior</SelectItem>
                      <SelectItem value="ADMIN">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>License Type</Label>
                  <Select value={form.licenseType} onValueChange={(v) => setForm({ ...form, licenseType: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="EA">Enrolled Agent (EA)</SelectItem>
                      <SelectItem value="CPA">CPA</SelectItem>
                      <SelectItem value="ATTORNEY">Attorney</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="licenseNumber">License Number</Label>
                <Input
                  id="licenseNumber"
                  value={form.licenseNumber}
                  onChange={(e) => setForm({ ...form, licenseNumber: e.target.value })}
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? (editUser ? "Saving..." : "Creating...") : (editUser ? "Save Changes" : "Create User")}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading users...</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>License</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">{user.name}</TableCell>
                  <TableCell>{user.email}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={roleBadgeColor[user.role] || ""}>
                      {user.role}
                    </Badge>
                  </TableCell>
                  <TableCell>{user.licenseType} - {user.licenseNumber}</TableCell>
                  <TableCell className="text-right space-x-2">
                    <Button variant="ghost" size="sm" onClick={() => openEditDialog(user)}>
                      Edit
                    </Button>
                    <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700" onClick={() => handleDelete(user)}>
                      Remove
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}
