import { useEffect, useState, useCallback } from 'react'
import { supabase, isSupabaseConfigured } from '@/lib/supabase'
import { usePrivyAccount } from './usePrivyAccount'

export interface Contact {
  id: string
  owner_address: string
  contact_address: string
  contact_name: string
  contact_email: string | null
  created_at: string
  updated_at: string
}

export function useContacts() {
  const { address } = usePrivyAccount()
  const [contacts, setContacts] = useState<Contact[]>([])
  const [isLoading, setIsLoading] = useState(false)

  const normalizedAddress = address?.toLowerCase()

  const fetchContacts = useCallback(async () => {
    if (!normalizedAddress || !isSupabaseConfigured()) return
    setIsLoading(true)
    try {
      const { data, error } = await supabase
        .from('contacts')
        .select('*')
        .eq('owner_address', normalizedAddress)
        .order('contact_name', { ascending: true })

      if (error) {
        console.error('Error fetching contacts:', error)
        return
      }
      setContacts(data || [])
    } finally {
      setIsLoading(false)
    }
  }, [normalizedAddress])

  const addContact = useCallback(async (
    contactAddress: string,
    contactName: string,
    contactEmail?: string
  ) => {
    if (!normalizedAddress || !isSupabaseConfigured()) return null
    const { data, error } = await supabase
      .from('contacts')
      .upsert(
        {
          owner_address: normalizedAddress,
          contact_address: contactAddress.toLowerCase(),
          contact_name: contactName,
          contact_email: contactEmail || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'owner_address,contact_address' }
      )
      .select()
      .single()

    if (error) {
      console.error('Error adding contact:', error)
      return null
    }
    await fetchContacts()
    return data as Contact
  }, [normalizedAddress, fetchContacts])

  const updateContact = useCallback(async (
    contactId: string,
    updates: { contact_name?: string; contact_email?: string }
  ) => {
    if (!isSupabaseConfigured()) return false
    const { error } = await supabase
      .from('contacts')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', contactId)

    if (error) {
      console.error('Error updating contact:', error)
      return false
    }
    await fetchContacts()
    return true
  }, [fetchContacts])

  const deleteContact = useCallback(async (contactId: string) => {
    if (!isSupabaseConfigured()) return false
    const { error } = await supabase
      .from('contacts')
      .delete()
      .eq('id', contactId)

    if (error) {
      console.error('Error deleting contact:', error)
      return false
    }
    setContacts(prev => prev.filter(c => c.id !== contactId))
    return true
  }, [])

  const findContact = useCallback((addressOrName: string) => {
    const query = addressOrName.toLowerCase()
    return contacts.filter(
      c =>
        c.contact_address.toLowerCase().includes(query) ||
        c.contact_name.toLowerCase().includes(query)
    )
  }, [contacts])

  useEffect(() => {
    fetchContacts()
  }, [fetchContacts])

  return {
    contacts,
    isLoading,
    addContact,
    updateContact,
    deleteContact,
    findContact,
    refetch: fetchContacts,
  }
}
