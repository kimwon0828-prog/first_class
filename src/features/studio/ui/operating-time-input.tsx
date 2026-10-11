"use client"

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react"
import { normalizeOperatingTimeInput, operatingTimeOptions } from "../lib/operating-time-input"
import styles from "./operating-time-input.module.css"

type OperatingTimeInputProps = {
  label: string
  ariaLabel: string
  value: string
  disabled?: boolean
  onChange: (value: string) => void
}

export function OperatingTimeInput({ label, ariaLabel, value, disabled = false, onChange }: OperatingTimeInputProps) {
  const id = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const [touched, setTouched] = useState(false)
  const options = operatingTimeOptions(value)
  const normalized = normalizeOperatingTimeInput(value)
  const invalid = touched && normalized === null
  const expanded = open && !disabled

  useEffect(() => {
    if (!expanded) return
    const dismiss = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener("pointerdown", dismiss)
    return () => document.removeEventListener("pointerdown", dismiss)
  }, [expanded])

  useEffect(() => {
    if (expanded) menuRef.current?.children[activeIndex]?.scrollIntoView({ block: "nearest" })
  }, [expanded, activeIndex])

  const formatInput = () => {
    setTouched(true)
    if (normalized !== null && normalized !== value) onChange(normalized)
  }
  const openList = () => {
    setActiveIndex(Math.max(0, options.indexOf(normalized || "09:00")))
    setOpen(true)
    inputRef.current?.focus()
  }
  const choose = (time: string) => {
    onChange(time)
    setTouched(false)
    setOpen(false)
    inputRef.current?.focus()
  }
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault()
      if (!expanded) openList()
      else setActiveIndex(index => Math.max(0, Math.min(options.length - 1, index + (event.key === "ArrowDown" ? 1 : -1))))
    } else if (expanded && (event.key === "Home" || event.key === "End")) {
      event.preventDefault()
      setActiveIndex(event.key === "Home" ? 0 : options.length - 1)
    } else if (event.key === "Enter") {
      event.preventDefault()
      if (expanded) choose(options[activeIndex])
      else formatInput()
    } else if (event.key === "Escape" && expanded) {
      event.preventDefault()
      event.stopPropagation()
      setOpen(false)
    } else if (event.key === "Tab") setOpen(false)
  }

  return <div ref={rootRef} className={styles.field} onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false)
  }}>
    <label className={styles.label} htmlFor={id}>{label}</label>
    <div className={`${styles.control} ${invalid ? styles.invalid : ""}`}>
      <input ref={inputRef} id={id} className={styles.input} type="text" inputMode="numeric"
        role="combobox" aria-label={ariaLabel} aria-autocomplete="none" aria-haspopup="listbox"
        aria-expanded={expanded} aria-controls={expanded ? `${id}-options` : undefined}
        aria-activedescendant={expanded ? `${id}-option-${activeIndex}` : undefined}
        aria-invalid={invalid} aria-describedby={invalid ? `${id}-error` : undefined}
        autoComplete="off" maxLength={5} placeholder="09:00" value={value} disabled={disabled}
        onChange={event => { onChange(event.target.value); setOpen(false) }}
        onBlur={formatInput} onKeyDown={onKeyDown} />
      <button className={styles.toggle} type="button" aria-label={`${ariaLabel} 빠른 선택`}
        aria-haspopup="listbox" aria-expanded={expanded} aria-controls={expanded ? `${id}-options` : undefined}
        disabled={disabled} onClick={() => expanded ? setOpen(false) : openList()}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
      </button>
    </div>
    {expanded ? <div ref={menuRef} id={`${id}-options`} className={styles.options} role="listbox" aria-label={`${ariaLabel} 목록`}>
      {options.map((time, index) => <button key={time} id={`${id}-option-${index}`} type="button"
        className={`${styles.option} ${index === activeIndex ? styles.active : ""}`}
        role="option" aria-selected={time === normalized} tabIndex={-1}
        onPointerDown={event => event.preventDefault()} onClick={() => choose(time)}>
        <span>{time}</span>{time === normalized ? <span aria-hidden="true">✓</span> : null}
      </button>)}
    </div> : null}
    {invalid ? <span className={styles.error} id={`${id}-error`} role="alert">00:00~23:59로 입력해 주세요.</span> : null}
  </div>
}
