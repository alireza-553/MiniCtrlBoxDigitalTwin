"""Simultaneous main-button input through the API and actual browser handlers."""

import shutil
import subprocess
import unittest
from unittest.mock import patch

from mcb_digital_twin.web_app import HTML, SimulationController


class MainButtonsTests(unittest.TestCase):
    def test_both_states_reach_program_in_one_update(self):
        controller = SimulationController()
        observed = []
        with patch.object(controller, "_program_inputs", side_effect=lambda: observed.append(
                tuple(controller.main_buttons[side].state for side in ("left", "right")))):
            controller.action({"action": "main_buttons", "states": {"left": True, "right": True}})
            controller.action({"action": "main_buttons", "states": {"left": False, "right": False}})
        self.assertEqual(observed, [(True, True), (False, False)])
        for button in controller.state()["main_buttons"].values():
            self.assertEqual(button, {"down": False, "pressed": True, "released": True})

    def test_invalid_batch_changes_neither_button(self):
        controller = SimulationController()
        for states in (None, {}, {"left": True}, {"left": True, "right": 1},
                       {"left": True, "right": False, "other": True}):
            with self.subTest(states=states), self.assertRaises(ValueError):
                controller.action({"action": "main_buttons", "states": states})
            self.assertFalse(any(button.state for button in controller.main_buttons.values()))

    def test_browser_press_release_keyboard_cancel_and_overlapping_inputs(self):
        node = shutil.which("node")
        if not node:
            self.skipTest("Node.js is needed to execute the browser handlers")
        # Execute the shipped handlers, not a second implementation of them.
        handlers = HTML.split("const heldMainKeys=new Set();", 1)[1].split("for(let i=0;i<4;i++)bindMomentary", 1)[0]
        script = r'''
const assert=require('node:assert/strict');
const controls=new Map(),calls=[];
const $=id=>{if(!controls.has(id))controls.set(id,{handlers:{},attributes:{},
 addEventListener(event,fn){this.handlers[event]=fn},
 setAttribute(key,value){this.attributes[key]=value},focus(){},setPointerCapture(){}});return controls.get(id)};
const act=(action,payload)=>calls.push({action,...payload});
const heldMainKeys=new Set();
''' + handlers + r'''
const key=$('main-key-both');
bindMomentary(key,pressed=>setMainKeys({left:pressed,right:pressed},'both'));
const event={button:0,pointerId:1,preventDefault(){},key:' '};
key.handlers.pointerdown(event);
assert.deepEqual(calls.at(-1),{action:'main_buttons',states:{left:true,right:true}});
assert.equal($('main-key-left').attributes['aria-pressed'],'true');
assert.equal($('main-key-right').attributes['aria-pressed'],'true');
key.handlers.pointerup(event);
key.handlers.lostpointercapture(event);
assert.equal(calls.length,2);
assert.deepEqual(calls.at(-1).states,{left:false,right:false});
for(const cancel of ['pointercancel','blur','lostpointercapture']){
 key.handlers.pointerdown(event);key.handlers[cancel](event);
 assert.deepEqual(calls.at(-1).states,{left:false,right:false});
}
key.handlers.keydown(event);const count=calls.length;key.handlers.keydown(event);
assert.equal(calls.length,count);key.handlers.keyup(event);
assert.deepEqual(calls.at(-1).states,{left:false,right:false});
setMainKey('left',true);key.handlers.pointerdown(event);key.handlers.pointerup(event);
assert.deepEqual(calls.at(-1).states,{left:true,right:false});
releaseMainKeys();assert.deepEqual(calls.at(-1).states,{left:false,right:false});
key.handlers.pointerdown(event);releaseMainKeys();key.handlers.pointerup(event);
assert.deepEqual(calls.at(-1).states,{left:false,right:false});
'''
        result = subprocess.run([node, "-"], input=script, text=True, capture_output=True, timeout=10)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('id="main-key-both"', HTML)
        self.assertIn("bindMomentary($('main-key-both')", HTML)


if __name__ == "__main__":
    unittest.main()
